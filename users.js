// ══════════════════════════════════════════════════════════
// users.js — إدارة المستخدمين والصلاحيات
// ══════════════════════════════════════════════════════════

import {
  auth, db, COLL,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
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

  const email  = (g('new-email')?.value       || '').trim().toLowerCase();
  const pass   = (g('new-password')?.value    || '').trim();
  const name   = (g('new-name')?.value        || '').trim() || email.split('@')[0];
  const adminP = (g('current-pass-for-add')?.value || '').trim();

  if (!email || !pass)  { toast('⚠ أدخل البريد وكلمة المرور','err');        return; }
  if (pass.length < 6)  { toast('⚠ كلمة المرور 6 أحرف على الأقل','err');   return; }
  if (!_isValidEmail(email)) { toast('⚠ البريد الإلكتروني غير صحيح','err'); return; }

  const customPages = [];
  document.querySelectorAll('.perm-check:checked').forEach(cb => customPages.push(cb.value));
  if (!customPages.length) { toast('⚠ اختر صلاحية واحدة على الأقل','err'); return; }

  const btn = g('add-user-btn');
  if (btn) { btn.textContent='جاري الإضافة...'; btn.disabled=true; }

  try {
    // فحص وجود المستخدم مسبقاً في قاعدة البيانات
    const usersSnap = await getDocs(collection(db, COLL.USERS));
    let existingDoc = null;
    usersSnap.forEach(d => {
      if ((d.data().email||'').toLowerCase() === email) existingDoc = { id:d.id, ...d.data() };
    });

    if (existingDoc) {
      // إعادة تفعيل / تحديث الصلاحيات
      await updateDoc(doc(db, COLL.USERS, existingDoc.id), {
        deleted: false, active: true, displayName: name,
        role: 'custom', customPages,
        updatedAt: new Date().toISOString(), updatedBy: currentUser.email,
      });
      toast(`✅ تم تفعيل "${name}" بصلاحيات جديدة`, 'ok');
    } else {
      let newUid = null;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        newUid = cred.user.uid;
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-in-use') {
          if (btn) btn.textContent = 'جاري استعادة...';
          try {
            const existCred = await signInWithEmailAndPassword(auth, email, pass);
            newUid = existCred.user.uid;
          } catch {
            if (adminP) await signInWithEmailAndPassword(auth, currentUser.email, adminP).catch(()=>{});
            toast('⚠ هذا البريد مسجّل بكلمة مرور مختلفة','err');
            if (btn) { btn.textContent='➕ إضافة المستخدم'; btn.disabled=false; }
            return;
          }
        } else { throw createErr; }
      }

      await setDoc(doc(db, COLL.USERS, newUid), {
        email, displayName: name, role: 'custom', customPages,
        active: true, deleted: false,
        createdAt: new Date().toISOString(), createdBy: currentUser.email,
      });

      // العودة لحساب المدير
      if (adminP) await signInWithEmailAndPassword(auth, currentUser.email, adminP).catch(()=>{});
      toast(`✅ تم إضافة "${name}" بنجاح`, 'ok');
      await writeAuditLog('ADD_USER', { email, name });
    }

    // مسح الحقول
    ['new-email','new-password','new-name','current-pass-for-add'].forEach(id => { const el=g(id); if(el)el.value=''; });
    document.querySelectorAll('.perm-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked=false);
    await renderUsersList();

  } catch(e) {
    if (e.code === 'auth/email-already-in-use') toast('⚠ البريد الإلكتروني مستخدم مسبقاً','err');
    else toast('⚠ خطأ في الإضافة — تحقق من البيانات','err');
  }
  if (btn) { btn.textContent='➕ إضافة المستخدم'; btn.disabled=false; }
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
      const actionBtn = isMe ? '' : u.deleted
        ? `<div style="display:flex;flex-direction:column;gap:5px">
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--green);white-space:nowrap" onclick="reactivateUser('${u.id}','${_esc(u.displayName||u.email)}')">✅ إعادة تفعيل</button>
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--red);white-space:nowrap" onclick="hardDeleteUser('${u.id}','${_esc(u.email)}')">🗑 حذف نهائي</button>
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:5px">
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--b600);white-space:nowrap" onclick="openEditPermissions('${u.id}','${_esc(u.displayName||u.email)}','${encodeURIComponent(JSON.stringify(u.customPages||[]))}')">✏️ تعديل</button>
             <button class="sg-btn" style="font-size:.7rem;padding:5px 10px;background:var(--red);white-space:nowrap" onclick="softDeleteUser('${u.id}','${_esc(u.email)}')">تعطيل</button>
           </div>`;
      return `<div class="user-row" style="flex-wrap:wrap;gap:8px;align-items:flex-start;${u.deleted?'opacity:.6':''}">
        <div class="user-avatar" style="${u.deleted?'background:var(--text3)':''}">${(u.displayName||u.email||'?').charAt(0).toUpperCase()}</div>
        <div class="user-info" style="flex:1;min-width:140px">
          <div class="user-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            ${_esc(u.displayName||u.email)} ${isMe?'<span style="font-size:.65rem;color:var(--text3)">(أنت)</span>':''} ${statusBadge}
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
export function openEditPermissions(uid, name, currentPagesJson) {
  const mo = g('edit-perms-mo');
  if (!mo) return;
  g('ep-title').textContent = `✏️ صلاحيات ${name}`;
  mo._uid  = uid;
  mo._name = name;
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

  const customPages = [];
  document.querySelectorAll('.ep-perm-card.selected .perm-check').forEach(cb => customPages.push(cb.value));
  if (!customPages.length) { toast('⚠ اختر صلاحية واحدة على الأقل','err'); return; }

  const btn = g('ep-save-btn');
  if (btn) { btn.textContent='جاري الحفظ...'; btn.disabled=true; }
  try {
    await updateDoc(doc(db, COLL.USERS, uid), {
      customPages, updatedAt: new Date().toISOString(), updatedBy: get().currentUser?.email
    });
    await writeAuditLog('EDIT_PERMISSIONS', { uid, name });
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
