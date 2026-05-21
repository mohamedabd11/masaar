// ══════════════════════════════════════════════════════════
// users.js — إدارة المستخدمين والصلاحيات
// ══════════════════════════════════════════════════════════

import {
  auth, db, COLL,
  sendPasswordResetEmail,
  collection, getDocs, doc, deleteDoc, updateDoc, setDoc
} from './firebase.js';

// ── Context يُحدَّث من app.js ──
let _ctx         = null;
let _DEFAULT_PERMS = null;
let _ALL_PAGES   = null;

export function initUsers(ctx, defaultPerms, allPages) {
  _ctx          = ctx;
  _DEFAULT_PERMS = defaultPerms;
  _ALL_PAGES    = allPages;
}

const g    = id => document.getElementById(id);
const get  = ()  => _ctx.getState();
const h    = ()  => _ctx.helpers;

// ══════════════════════════════
// إضافة مستخدم جديد
// ══════════════════════════════
export async function addUser() {
  const { currentUser } = get();
  const { toast, writeAuditLog } = h();

  const email = (g('new-email')?.value || '').trim().toLowerCase();
  const name  = (g('new-name')?.value  || '').trim() || email.split('@')[0];

  if (!email)               { toast('⚠ أدخل البريد الإلكتروني','err');    return; }
  if (!_isValidEmail(email)){ toast('⚠ البريد الإلكتروني غير صحيح','err'); return; }

  // تحديد نوع المستخدم: مدير أو موظف
  const roleType = window._newUserRoleType || 'employee';
  let userRole, customPages;
  if (roleType === 'manager') {
    userRole    = 'manager';
    customPages = _DEFAULT_PERMS.manager || [];
  } else {
    userRole    = 'custom';
    customPages = [];
    document.querySelectorAll('.perm-check:checked').forEach(cb => customPages.push(cb.value));
    if (!customPages.length) { toast('⚠ اختر صلاحية واحدة على الأقل','err'); return; }
  }

  const btn = g('add-user-btn');
  if (btn) { btn.textContent='جاري الإضافة...'; btn.disabled=true; }

  try {
    // فحص وجود المستخدم في Firestore
    const usersSnap = await getDocs(collection(db, COLL.USERS));
    let existingDoc = null;
    usersSnap.forEach(d => {
      if ((d.data().email||'').toLowerCase() === email) existingDoc = { id:d.id, ...d.data() };
    });

    if (existingDoc) {
      // إعادة تفعيل مستخدم موجود وتحديث صلاحياته
      await updateDoc(doc(db, COLL.USERS, existingDoc.id), {
        deleted: false, active: true, displayName: name,
        role: userRole, customPages,
        updatedAt: new Date().toISOString(), updatedBy: currentUser.email,
      });
    } else {
      // إنشاء حساب Firebase Auth عبر REST API
      // (لا يؤثر على جلسة المدير الحالية — لا تسجيل خروج)
      const apiKey = auth.app.options.apiKey;
      const res  = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password: _randomPassword(), returnSecureToken: true })
        }
      );
      const data = await res.json();

      if (data.error) {
        const msg = data.error.message || '';
        if (msg === 'EMAIL_EXISTS') {
          // الحساب موجود في Firebase Auth لكن ليس في Firestore
          // نرسل رابط الدعوة فقط
          await sendPasswordResetEmail(auth, email).catch(() => {});
          toast('⚠ البريد مُسجَّل مسبقاً — تم إرسال رابط الدعوة له', '');
          if (btn) { btn.textContent='➕ إضافة المستخدم'; btn.disabled=false; }
          return;
        }
        throw new Error(msg);
      }

      // حفظ بيانات المستخدم في Firestore
      await setDoc(doc(db, COLL.USERS, data.localId), {
        email, displayName: name, role: userRole, customPages,
        active: true, deleted: false,
        createdAt: new Date().toISOString(), createdBy: currentUser.email,
      });
      await writeAuditLog('ADD_USER', { email, name, role: userRole });
    }

    // إرسال رابط الدعوة بالبريد الإلكتروني
    await sendPasswordResetEmail(auth, email).catch(err => {
      console.warn('[AddUser] sendPasswordResetEmail:', err.message);
    });

    toast(`✅ تم إضافة "${name}" وإرسال رابط الدعوة إلى ${email}`, 'ok');

    // مسح حقول النموذج
    ['new-email','new-name'].forEach(id => { const el=g(id); if(el) el.value=''; });
    document.querySelectorAll('.perm-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked=false);
    await renderUsersList();

  } catch(e) {
    console.error('[AddUser]', e);
    toast('⚠ خطأ في الإضافة — ' + (e.message || 'تحقق من البيانات'), 'err');
  }
  if (btn) { btn.textContent='➕ إضافة المستخدم'; btn.disabled=false; }
}

/** كلمة مرور عشوائية قوية (داخلية فقط — لا تُعرض لأحد) */
function _randomPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let p = '';
  for (let i = 0; i < 18; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

// ══════════════════════════════
// عرض قائمة المستخدمين
// ══════════════════════════════
export async function renderUsersList() {
  const { currentUser } = get();
  const el = g('users-list');
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text3);font-size:.82rem">
    <div class="skeleton-row" style="height:44px;border-radius:8px;margin-bottom:8px;background:var(--line)"></div>
    <div class="skeleton-row" style="height:44px;border-radius:8px;background:var(--line)"></div>
  </div>`;

  try {
    const snap = await getDocs(collection(db, COLL.USERS));
    const users = []; snap.forEach(d => users.push({ id:d.id, ...d.data() }));
    const pageLabels = {};
    _ALL_PAGES.forEach(p => pageLabels[p.id] = p.label);
    const active  = users.filter(u => !u.deleted);
    const deleted = users.filter(u => u.deleted);

    const renderUser = (u) => {
      const isMe = u.id === currentUser?.uid;
      const pages = u.deleted ? [] : (u.customPages || _DEFAULT_PERMS[u.role] || []);
      const pagesHtml = pages.length
        ? pages.map(p => `<span style="font-size:.63rem;background:var(--b100);color:var(--b600);border:1px solid var(--b200);border-radius:4px;padding:1px 6px;margin:2px;display:inline-block">${pageLabels[p]||p}</span>`).join('')
        : u.deleted ? '<span style="font-size:.7rem;color:var(--red)">⛔ معطّل</span>' : '';
      const statusBadge = u.deleted
        ? `<span style="font-size:.62rem;background:#fee2e2;color:var(--red);border:1px solid #fca5a5;border-radius:4px;padding:1px 7px;display:inline-block;margin-right:4px">🔴 معطّل</span>`
        : `<span style="font-size:.62rem;background:#dcfce7;color:var(--green);border:1px solid #86efac;border-radius:4px;padding:1px 7px;display:inline-block;margin-right:4px">🟢 نشط</span>`;
      const roleBadge = u.role === 'admin'
        ? `<span style="font-size:.62rem;background:#fef9c3;color:#92400e;border:1px solid #d97706;border-radius:4px;padding:1px 7px;display:inline-block;margin-right:4px">⭐ مدير النظام</span>`
        : u.role === 'manager'
        ? `<span style="font-size:.62rem;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:4px;padding:1px 7px;display:inline-block;margin-right:4px">👔 مدير</span>`
        : `<span style="font-size:.62rem;background:var(--surface);color:var(--text3);border:1px solid var(--line);border-radius:4px;padding:1px 7px;display:inline-block;margin-right:4px">👤 موظف</span>`;
      const actionBtn = isMe ? '' : u.deleted
        ? `<div style="display:flex;flex-direction:column;gap:5px">
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--green);white-space:nowrap" onclick="reactivateUser('${u.id}','${_esc(u.displayName||u.email)}')">✅ إعادة تفعيل</button>
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--red);white-space:nowrap" onclick="hardDeleteUser('${u.id}','${_esc(u.email)}')">🗑 حذف نهائي</button>
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:5px">
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--b600);white-space:nowrap" onclick="openEditPermissions('${u.id}','${_esc(u.displayName||u.email)}','${encodeURIComponent(JSON.stringify(u.customPages||[]))}','${u.role||'custom'}')">✏️ تعديل</button>
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--red);white-space:nowrap" onclick="softDeleteUser('${u.id}','${_esc(u.email)}')">تعطيل</button>
           </div>`;
      return `<div class="user-row" style="flex-wrap:wrap;gap:8px;align-items:flex-start;${u.deleted?'opacity:.6':''}">
        <div class="user-avatar" style="${u.deleted?'background:var(--text3)':u.role==='manager'?'background:#1d4ed8':''}">
          ${(u.displayName||u.email||'?').charAt(0).toUpperCase()}
        </div>
        <div class="user-info" style="flex:1;min-width:140px">
          <div class="user-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            ${_esc(u.displayName||u.email)} ${isMe?'<span style="font-size:.65rem;color:var(--text3)">(أنت)</span>':''} ${roleBadge} ${statusBadge}
          </div>
          <div style="font-size:.7rem;color:var(--text3);margin-bottom:4px">${_esc(u.email)}</div>
          <div>${pagesHtml}</div>
        </div>
        ${actionBtn}
      </div>`;
    };

    let html = active.map(renderUser).join('');
    if (deleted.length) {
      html += `<div style="margin-top:14px;padding:10px 12px;background:var(--surface);border-radius:var(--r2);border:1px dashed var(--line)">
        <div style="font-size:.7rem;color:var(--text3);margin-bottom:10px;font-weight:700">⛔ المستخدمون المعطّلون (${deleted.length})</div>
        ${deleted.map(renderUser).join('')}
      </div>`;
    }
    el.innerHTML = html || '<div style="padding:16px;text-align:center;color:var(--text3)">لا يوجد مستخدمون</div>';
  } catch(e) {
    el.innerHTML = '<div style="padding:16px;color:var(--red);text-align:center">خطأ في تحميل المستخدمين</div>';
  }
}

// ══════════════════════════════
// تعطيل مستخدم
// ══════════════════════════════
export async function softDeleteUser(uid, email) {
  const { currentUser } = get();
  const { toast, writeAuditLog } = h();
  if (!confirm(`تعطيل "${email}"؟\nلن يستطيع الدخول لكن يمكن إعادة تفعيله.`)) return;
  try {
    await updateDoc(doc(db, COLL.USERS, uid), {
      deleted: true, active: false, customPages: [], role: 'deleted',
      deletedAt: new Date().toISOString(), deletedBy: currentUser?.email||''
    });
    await writeAuditLog('DISABLE_USER', { email });
    await renderUsersList();
    toast('✅ تم تعطيل المستخدم','ok');
  } catch(e) { toast('⚠ خطأ في التعطيل','err'); }
}

// ══════════════════════════════
// إعادة تفعيل مستخدم
// ══════════════════════════════
export async function reactivateUser(uid, name) {
  const { currentUser } = get();
  const { toast } = h();
  if (!confirm(`إعادة تفعيل "${name}"؟`)) return;
  try {
    await updateDoc(doc(db, COLL.USERS, uid), {
      deleted: false, active: true,
      reactivatedAt: new Date().toISOString(), reactivatedBy: currentUser?.email||''
    });
    await renderUsersList();
    toast('✅ تم إعادة تفعيل المستخدم','ok');
  } catch(e) { toast('⚠ خطأ في التفعيل','err'); }
}

// ══════════════════════════════
// حذف نهائي
// ══════════════════════════════
export async function hardDeleteUser(uid, email) {
  const { currentUser } = get();
  const { toast, writeAuditLog } = h();
  if (!confirm(`حذف نهائي لـ "${email}" من قاعدة البيانات؟\nلن تتمكن من استعادته.`)) return;
  try {
    await deleteDoc(doc(db, COLL.USERS, uid));
    await writeAuditLog('DELETE_USER', { email });
    await renderUsersList();
    toast('✅ تم الحذف النهائي','ok');
  } catch(e) { toast('⚠ خطأ في الحذف','err'); }
}

// ══════════════════════════════
// تعديل صلاحيات مستخدم
// ══════════════════════════════
export function openEditPermissions(uid, name, currentPagesJson, currentUserRole) {
  const mo = g('edit-perms-mo');
  if (!mo) return;
  g('ep-title').textContent = `✏️ صلاحيات ${name}`;
  mo._uid  = uid;
  mo._name = name;

  const isManager = currentUserRole === 'manager';
  window._editUserRoleType = isManager ? 'manager' : 'employee';
  const permWrap = g('ep-perm-wrap');
  if (permWrap) permWrap.style.display = isManager ? 'none' : '';
  const eBtn = g('ep-role-employee');
  const mBtn = g('ep-role-manager');
  if (eBtn) eBtn.className = 'ctype' + (!isManager ? ' act-r' : '');
  if (mBtn) mBtn.className = 'ctype' + (isManager  ? ' act-r' : '');

  let currentPerms = [];
  try { currentPerms = JSON.parse(decodeURIComponent(currentPagesJson)); } catch{}
  document.querySelectorAll('.ep-perm-card').forEach(card => {
    const val = card.getAttribute('data-val');
    const isSelected = currentPerms.includes(val);
    card.classList.toggle('selected', isSelected);
    const cb = card.querySelector('.perm-check');
    if (cb) cb.checked = isSelected;
  });
  mo.classList.add('open');
}

export async function saveEditPermissions() {
  const { toast, writeAuditLog } = h();
  const mo   = g('edit-perms-mo');
  const uid  = mo?._uid;
  const name = mo?._name;
  if (!uid) { toast('⚠ خطأ في البيانات','err'); return; }

  const roleType = window._editUserRoleType || 'employee';
  let userRole, customPages;
  if (roleType === 'manager') {
    userRole    = 'manager';
    customPages = _DEFAULT_PERMS.manager || [];
  } else {
    userRole    = 'custom';
    customPages = [];
    document.querySelectorAll('.ep-perm-card.selected .perm-check').forEach(cb => customPages.push(cb.value));
    if (!customPages.length) { toast('⚠ اختر صلاحية واحدة على الأقل','err'); return; }
  }

  const btn = g('ep-save-btn');
  if (btn) { btn.textContent='جاري الحفظ...'; btn.disabled=true; }
  try {
    await updateDoc(doc(db, COLL.USERS, uid), {
      role: userRole, customPages, updatedAt: new Date().toISOString(), updatedBy: get().currentUser?.email
    });
    await writeAuditLog('EDIT_PERMISSIONS', { uid, name, role: userRole });
    g('edit-perms-mo').classList.remove('open');
    await renderUsersList();
    toast(`✅ تم تحديث صلاحيات "${name}"`, 'ok');
  } catch(e) { toast('⚠ خطأ في الحفظ','err'); }
  if (btn) { btn.textContent='💾 حفظ الصلاحيات'; btn.disabled=false; }
}

// ══════════════════════════════
// دالة مساعدة
// ══════════════════════════════
function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
