// ══════════════════════════════════════════════════════════
// shifts.js — إقفال الوردية
// ══════════════════════════════════════════════════════════

import {
  db, COLL,
  collection, addDoc, getDocs, doc, deleteDoc
} from './firebase.js';

function _esc(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let _ctx = null;

export function initShifts(ctx) {
  _ctx = ctx;
}

export function openShiftClosure() {
  const { getState, helpers: { g, fEN, setEl } } = _ctx;
  const AppState = getState();
  const mo = g('shift-mo'); if (!mo) return;

  const actual = g('shift-actual-amt'); if (actual) actual.value = '';
  const notes  = g('shift-notes');      if (notes)  notes.value  = '';
  const vrRow  = g('shift-variance-row'); if (vrRow) vrRow.style.display = 'none';

  if (AppState.currentRole === 'admin') {
    const wrap = g('shift-user-wrap'); if (wrap) wrap.style.display = 'block';
    const sel  = g('shift-user-select');
    if (!sel) { mo.classList.add('open'); return; }
    const users = {};
    AppState.entries.forEach(e => {
      if (e.createdBy) users[e.createdBy] = e.createdByName || e.createdBy;
    });
    sel.innerHTML = Object.entries(users)
      .map(([em, nm]) => `<option value="${em}">${nm} (${em})</option>`)
      .join('');
    sel.innerHTML += `<option value="__all__">🌐 الكل</option>`;
    updateShiftView();
  } else {
    const wrap = g('shift-user-wrap'); if (wrap) wrap.style.display = 'none';
    updateShiftView();
  }
  mo.classList.add('open');
}

export function updateShiftView() {
  const { getState, helpers: { g, fEN, setEl } } = _ctx;
  const AppState = getState();

  const selectedEmail = AppState.currentRole === 'admin'
    ? (g('shift-user-select')?.value || '__all__')
    : AppState.currentUser?.email;

  const relevant = AppState.entries.filter(e =>
    selectedEmail === '__all__' || e.createdBy === selectedEmail
  );

  let bal = 0;
  const asc = [...relevant].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  asc.forEach(e => { bal += (e.deb || 0) - (e.crd || 0); });

  setEl('shift-system-bal', `${fEN(bal)} ر.س`);
  const balEl = g('shift-system-bal');
  if (balEl) balEl.style.color = bal >= 0 ? 'var(--green)' : 'var(--red)';
  calcShiftVariance();
}

export function calcShiftVariance() {
  const { helpers: { g, fEN, setEl } } = _ctx;

  const actual    = parseFloat(g('shift-actual-amt')?.value);
  const sysBalStr = g('shift-system-bal')?.textContent || '0';
  const sysBal    = parseFloat(sysBalStr.replace(/,/g, '').replace('ر.س', '').trim()) || 0;

  if (isNaN(actual)) {
    const vr = g('shift-variance-row'); if (vr) vr.style.display = 'none';
    return;
  }

  const diff   = +(actual - sysBal).toFixed(2);
  const vrRow  = g('shift-variance-row'); if (vrRow) vrRow.style.display = 'block';

  setEl('shift-variance-val', `${diff >= 0 ? '+' : ''}${fEN(diff)} ر.س`);

  const lbl = g('shift-variance-lbl');
  if (lbl) {
    lbl.textContent = diff === 0 ? '✅ متطابق' : diff > 0 ? '📈 زيادة' : '📉 نقص';
    lbl.style.color = diff === 0 ? 'var(--green)' : diff > 0 ? 'var(--b600)' : 'var(--red)';
  }
  const valEl = g('shift-variance-val');
  if (valEl) valEl.style.color = diff === 0 ? 'var(--green)' : diff > 0 ? 'var(--b600)' : 'var(--red)';
}

export async function saveShiftClosure() {
  const { getState, helpers: { g, fEN, setEl, toast, writeAuditLog } } = _ctx;
  const AppState = getState();

  const actual = parseFloat(g('shift-actual-amt')?.value);
  if (isNaN(actual) || actual < 0) { toast('⚠ أدخل المبلغ الفعلي', 'err'); return; }

  const sysBalStr     = g('shift-system-bal')?.textContent || '0';
  const sysBal        = parseFloat(sysBalStr.replace(/,/g, '').replace('ر.س', '').trim()) || 0;
  const notes         = (g('shift-notes')?.value || '').trim();
  const diff          = +(actual - sysBal).toFixed(2);
  const selectedEmail = AppState.currentRole === 'admin'
    ? (g('shift-user-select')?.value || '__all__')
    : AppState.currentUser?.email;

  const btn = g('shift-save-btn');
  if (btn) { btn.textContent = 'جاري الإقفال...'; btn.disabled = true; }

  try {
    await addDoc(collection(db, COLL.SHIFTS), {
      closedBy:      AppState.currentUser.email,
      closedByName:  g('tb-username')?.textContent || '',
      forUser:       selectedEmail,
      systemBalance: sysBal,
      actualAmount:  actual,
      variance:      diff,
      notes,
      closedAt:      new Date().toISOString()
    });
    window.closeMo('shift-mo');
    await renderShifts();
    toast(`✅ تم إقفال الوردية — الفارق: ${fEN(diff)} ر.س`, 'ok');
    await writeAuditLog('SHIFT_CLOSURE', { actual, sysBal, diff });
  } catch (e) {
    toast('⚠ خطأ في الإقفال', 'err');
  }

  if (btn) { btn.textContent = '🔒 تأكيد الإقفال'; btn.disabled = false; }
}

export async function renderShifts() {
  const { getState, helpers: { g, fEN } } = _ctx;
  const AppState = getState();
  const el = g('shifts-list'); if (!el) return;

  el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:.8rem">جاري التحميل...</div>';

  try {
    const snap   = await getDocs(collection(db, COLL.SHIFTS));
    const shifts = [];
    snap.forEach(d => shifts.push({ id: d.id, ...d.data() }));
    shifts.sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));

    if (!shifts.length) {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">لا توجد إقفالات بعد</div>';
      return;
    }

    el.innerHTML = shifts.map(s => {
      const dt = s.closedAt
        ? new Date(s.closedAt).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      const diffBadge = s.variance === 0
        ? 'background:#dcfce7;color:#15803d'
        : s.variance > 0
          ? 'background:#dbeafe;color:#1d4ed8'
          : 'background:#fee2e2;color:#b91c1c';

      return `<div class="shift-row">
        <div class="shift-hd">
          <span class="shift-user">${_esc(s.closedByName || s.closedBy)}</span>
          <span class="shift-badge" style="${diffBadge};border:1px solid currentColor">الفارق: ${s.variance >= 0 ? '+' : ''}${fEN(s.variance)} ر.س</span>
        </div>
        <div class="shift-time">📅 ${dt} ${s.forUser && s.forUser !== '__all__' ? `| 👤 ${_esc(s.forUser)}` : ''}</div>
        <div class="shift-stats">
          <div class="sst"><div class="sst-l">الرصيد النظامي</div><div class="sst-v">${fEN(s.systemBalance)} ر.س</div></div>
          <div class="sst"><div class="sst-l">المبلغ الفعلي</div><div class="sst-v">${fEN(s.actualAmount)} ر.س</div></div>
          <div class="sst"><div class="sst-l">الفارق</div><div class="sst-v" style="${diffBadge};padding:3px 6px;border-radius:6px">${s.variance >= 0 ? '+' : ''}${fEN(s.variance)}</div></div>
        </div>
        ${s.notes ? `<div class="shift-note">📝 ${_esc(s.notes)}</div>` : ''}
        ${AppState.currentRole === 'admin' ? `<div style="margin-top:8px"><button class="sg-btn danger" style="font-size:.68rem;padding:3px 10px" onclick="deleteShiftRecord('${s.id}')">🗑 حذف</button></div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="padding:16px;color:var(--red);text-align:center">خطأ في التحميل</div>';
  }
}

export async function deleteShiftRecord(id) {
  const { helpers: { toast } } = _ctx;
  if (!confirm('حذف هذا الإقفال؟')) return;
  try {
    await deleteDoc(doc(db, COLL.SHIFTS, id));
    await renderShifts();
    toast('✅ تم الحذف', 'ok');
  } catch (e) {
    toast('⚠ خطأ في الحذف', 'err');
  }
}
