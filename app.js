// ══════════════════════════════════════════════════════════
// app.js — المحرك الرئيسي: الحالة، CRUD، التهيئة
// ══════════════════════════════════════════════════════════

import {
  db, auth, COLL,
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, onSnapshot, setDoc, getDoc, where
} from './firebase.js';
import { initAuth, doLogin, doLogout }                                          from './auth.js';
import { initReports, renderMeters, renderCustody, renderExpenses,
         renderLedger, updateSummary, openUserReport, renderUserReportTable,
         runReconcile }                                                         from './reports.js';
import { initExports, updateReportFilter, setExpDate, exportExcel, exportPDF,
         exportShortPDF, exportShortExcel, exportUserReportPDF,
         exportUserReportExcel, exportJSON, importJSON, loadAuditLog }          from './exports.js';
import { initUsers, addUser, renderUsersList, softDeleteUser, reactivateUser,
         hardDeleteUser, openEditPermissions, saveEditPermissions }             from './users.js';

// ══════════════════════════════════════════════
// CONSTANTS — الثوابت
// ══════════════════════════════════════════════
const EL = {
  fuel:'⛽ وقود', food:'🍱 وجبات', water:'💧 مياه',
  tools:'🔧 أدوات', trans:'🚗 نقل', other:'📦 أخرى'
};
const TL = {
  meter:'📏 سند أمتار', custody_r:'📥 استلام',
  custody_d:'📤 تسليم', expense:'💸 مصروف'
};
const ALL_PAGES = [
  { id:'pg-dash',       label:'🏠 الصفحة الرئيسية', icon:'🏠' },
  { id:'pg-meters',     label:'📏 سندات الأمتار',    icon:'📏' },
  { id:'pg-reconcile',  label:'⚖️ مطابقة الكشف',     icon:'⚖️' },
  { id:'pg-custody',    label:'🗂 العهدة',            icon:'🗂' },
  { id:'pg-expense',    label:'💸 المصروفات',          icon:'💸' },
  { id:'pg-ledger',     label:'📒 سجل العمليات',      icon:'📒' },
  { id:'pg-report',     label:'📊 التقارير',           icon:'📊' },
  { id:'pg-shifts',     label:'🔒 إقفال الوردية',     icon:'🔒', adminOnly:true },
  { id:'pg-users',      label:'👥 إدارة المستخدمين',  icon:'👥', adminOnly:true },
  { id:'pg-settings',   label:'⚙️ الإعدادات',         icon:'⚙️', adminOnly:true },
];
const DEFAULT_PERMS = {
  admin:  ['pg-dash','pg-meters','pg-reconcile','pg-custody','pg-expense','pg-ledger','pg-report','pg-shifts','pg-users','pg-settings'],
  editor: ['pg-meters','pg-reconcile','pg-custody','pg-expense'],
  viewer: ['pg-dash','pg-report'],
};
const PAGE_TITLES = {
  'pg-dash':'الرئيسية','pg-meters':'سندات الأمتار','pg-reconcile':'مطابقة الكشف',
  'pg-custody':'العهدة','pg-expense':'المصروفات','pg-ledger':'سجل العمليات',
  'pg-report':'التقارير','pg-shifts':'إقفال الوردية',
  'pg-users':'إدارة المستخدمين','pg-settings':'الإعدادات'
};

// ══════════════════════════════════════════════
// APP STATE — الحالة المركزية للتطبيق
// ══════════════════════════════════════════════
const AppState = {
  entries:       [],
  currentUser:   null,
  currentRole:   null,
  currentPages:  [],
  currentPageId: 'pg-dash',
  meterPrice:    14,
  invoicePrice:  15,
  unsubEntries:  null,
};

// ══════════════════════════════════════════════
// HELPER FUNCTIONS — الدوال المساعدة
// ══════════════════════════════════════════════
const fEN  = n  => (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fENn = n  => (n||0).toLocaleString('en-US');
const fD   = d  => { if(!d) return '—'; const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
const bCls = b  => b >= 0 ? 'td-bp' : 'td-bn';
const setEl= (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
const g    = id => document.getElementById(id);
let _toastTimer;
function toast(msg, type='') {
  const el = g('toast-el');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** حساب الرصيد التراكمي لجميع الحركات (مُحسَّن بـ cache) */
let _balsCache = null;
let _balsKey   = '';
function allBalances() {
  const key = AppState.entries.map(e=>e.id).join(',');
  if (key === _balsKey && _balsCache) return _balsCache;
  let b = 0; const map = {};
  const sorted = [...AppState.entries].sort((a,c) => {
    const d = (a.date||'').localeCompare(c.date||'');
    return d !== 0 ? d : (a.createdAt||'').localeCompare(c.createdAt||'');
  });
  for (const e of sorted) { b += (e.deb||0) - (e.crd||0); map[e.id] = b; }
  _balsCache = map; _balsKey = key;
  return map;
}

/** إبطال كاش الأرصدة عند التغيير */
function invalidateCache() { _balsCache = null; _balsKey = ''; }

/** Context object يُمرَّر لكل الـ modules */
const ctx = {
  getState: () => AppState,
  helpers: {
    fEN, fD, fENn, bCls, setEl, toast, allBalances,
    EL, TL,
    get writeAuditLog() { return writeAuditLog; },
    get METER_PRICE()   { return AppState.meterPrice; },
    get INVOICE_PRICE() { return AppState.invoicePrice; },
    get meterPrice()    { return AppState.meterPrice; },
    get invoicePrice()  { return AppState.invoicePrice; },
  }
};

// ══════════════════════════════════════════════
// AUDIT LOG — سجل المراجعة
// ══════════════════════════════════════════════
async function writeAuditLog(action, details = {}) {
  if (!AppState.currentUser) return;
  try {
    await addDoc(collection(db, COLL.AUDIT_LOG), {
      action,
      details,
      performedBy:     AppState.currentUser.email,
      performedByName: g('tb-username')?.textContent || AppState.currentUser.email.split('@')[0],
      timestamp:       new Date().toISOString()
    });
  } catch(e) { console.warn('[AuditLog]', e.message); }
}

// ══════════════════════════════════════════════
// AUTH FLOW — تدفق المصادقة
// ══════════════════════════════════════════════
function onLoginSuccess({ user, role, pages, name }) {
  AppState.currentUser  = user;
  AppState.currentRole  = role;
  AppState.currentPages = pages;
  showApp(name, role, pages, user);
}

function onLogout() {
  AppState.currentUser  = null;
  AppState.currentRole  = null;
  AppState.currentPages = [];
  AppState.entries      = [];
  invalidateCache();
  if (AppState.unsubEntries) { AppState.unsubEntries(); AppState.unsubEntries = null; }
  showLogin();
}

// ══════════════════════════════════════════════
// NAVIGATION — التنقل
// ══════════════════════════════════════════════
function showApp(name, role, pages, user) {
  hideSplash();
  g('auth-screen')?.classList.add('hidden');
  g('app-wrap')?.classList.remove('hidden');

  setEl('tb-username', name);
  const roleAr = {admin:'مدير النظام', editor:'محرر', viewer:'مراقب'};
  setEl('tb-role-lbl', roleAr[role] || role);
  const av = g('tb-avatar'); if (av) av.textContent = name.charAt(0).toUpperCase();

  applyPermissions();
  subscribeToEntries();
  loadSystemSettings();

  const today = new Date().toISOString().split('T')[0];
  ['m-date','c-date','e-date'].forEach(id => { const el=g(id); if(el) el.value=today; });
  const tel = g('m-time'); if (tel) tel.value = new Date().toTimeString().slice(0,5);
  const hour = new Date().getHours();
  const shiftSel = g('m-shift'); if (shiftSel) shiftSel.value = (hour>=7&&hour<19)?'day':'night';
  const dateStr = new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  setEl('tb-date', dateStr); setEl('sb-date-lbl', dateStr);

  // الانتقال للصفحة الأولى المتاحة
  const firstPage = pages[0] || 'pg-meters';
  const btn = document.querySelector(`.sb-item[data-page="${firstPage}"]`);
  if (btn) showPage(btn);
}

function showLogin() {
  hideSplash();
  g('auth-screen')?.classList.remove('hidden');
  g('app-wrap')?.classList.add('hidden');
  const btn = g('login-btn'); if (btn) { btn.textContent='دخول'; btn.disabled=false; }
}

function hideSplash() {
  const splash = g('splash-screen');
  if (splash) { splash.classList.add('hide'); setTimeout(()=>{ splash.style.display='none'; }, 450); }
}

function applyPermissions() {
  const { currentPages, currentRole } = AppState;
  document.querySelectorAll('.sb-item[data-page]').forEach(btn => {
    btn.style.display = currentPages.includes(btn.getAttribute('data-page')) ? '' : 'none';
  });
  document.querySelectorAll('.export-only').forEach(el => {
    el.style.display = (currentRole==='admin' || currentPages.includes('pg-report')) ? '' : 'none';
  });
}

// ── سجل التنقل (Stack للرجوع) ──
const _navHistory = [];

function showPage(btn) {
  const pageId = btn.getAttribute('data-page');
  if (!AppState.currentPages.includes(pageId)) return;

  // حفظ الصفحة الحالية للرجوع إليها
  const prev = AppState.currentPageId;
  if (prev && prev !== pageId) {
    _navHistory.push(prev);
    if (_navHistory.length > 15) _navHistory.shift();
  }
  AppState.currentPageId = pageId;

  // تفعيل الصفحة
  document.querySelectorAll('.sb-item').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-page') === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = g(pageId);
  if (page) page.classList.add('active');
  setEl('pg-title', PAGE_TITLES[pageId] || '');
  closeSidebar();

  // تحديثات خاصة بكل صفحة
  if (pageId === 'pg-users')     renderUsersList();
  if (pageId === 'pg-shifts')    renderShifts();
  if (pageId === 'pg-settings')  _populateSettingsPage();
  if (pageId === 'pg-ledger')    renderLedger();
  if (pageId === 'pg-reconcile') { if (!g('rec-input-tbody')?.children.length) addRecRow(); }
}

function navTo(pageId) {
  const btn = document.querySelector(`.sb-item[data-page="${pageId}"]`);
  if (btn) showPage(btn);
}

function _populateSettingsPage() {
  const un = g('tb-username');
  if (un && g('s-username')) {
    setEl('s-username', un.textContent || '—');
    setEl('s-email',    AppState.currentUser?.email || '—');
    setEl('s-role-badge', {admin:'مدير',editor:'محرر',viewer:'مراقب'}[AppState.currentRole] || AppState.currentRole || '—');
  }
}

// ══════════════════════════════════════════════
// FIREBASE SUBSCRIPTION — الاستماع للبيانات
// ══════════════════════════════════════════════
function subscribeToEntries() {
  if (AppState.unsubEntries) AppState.unsubEntries();
  const { currentUser, currentRole } = AppState;
  const q = currentRole === 'admin'
    ? query(collection(db, COLL.ENTRIES))
    : query(collection(db, COLL.ENTRIES), where('createdBy','==',currentUser.email));

  AppState.unsubEntries = onSnapshot(q, snapshot => {
    AppState.entries = [];
    snapshot.forEach(d => AppState.entries.push({ id:d.id, ...d.data() }));
    AppState.entries.sort((a,b) => {
      const d = (b.date||'').localeCompare(a.date||'');
      return d !== 0 ? d : (b.createdAt||'').localeCompare(a.createdAt||'');
    });
    invalidateCache();
    renderAll();
  }, err => { toast('⚠ خطأ في تحميل البيانات','err'); });
}

async function loadSystemSettings() {
  try {
    const snap = await getDoc(doc(db, COLL.SETTINGS, 'system'));
    if (snap.exists()) {
      const s = snap.data();
      if (s.driverPrice)  AppState.meterPrice   = +s.driverPrice;
      if (s.invoicePrice) AppState.invoicePrice  = +s.invoicePrice;
      setEl('sb-system-name',  s.companyName  || 'مسار');
      setEl('sb-project-name', s.projectName  || '');
      applyContractorName(s.contractorName || '');
      const hintEl = g('m-hint');
      if (hintEl) hintEl.innerHTML = `0 - 0 خصم = <strong>0 م³</strong> × ${AppState.meterPrice} = <strong>0.00 ر.س</strong>`;
      const map = {
        's-company-name':    s.companyName||'',
        's-contractor-name': s.contractorName||'',
        's-project-name':    s.projectName||'',
        's-driver-price':    s.driverPrice||14,
        's-invoice-price':   s.invoicePrice||15,
      };
      Object.entries(map).forEach(([id,val]) => { const el=g(id); if(el) el.value=val; });
    }
  } catch(e) { /* إعدادات لم تُحفظ بعد */ }
}

function applyContractorName(name) {
  document.querySelectorAll('.contractor-name-label').forEach(el => { el.textContent = name || 'الشركة المنفذة'; });
}

// ══════════════════════════════════════════════
// RENDER ALL — عرض كل البيانات
// ══════════════════════════════════════════════
function renderAll() {
  updateSummary();
  renderMeters();
  renderCustody();
  renderExpenses();
  renderLedger();
}

// ══════════════════════════════════════════════
// CRUD — العمليات الأساسية
// ══════════════════════════════════════════════

/** فحص تكرار رقم السند */
async function _checkDupRef(ref, onConfirm) {
  if (!ref) { onConfirm(); return; }
  const dup = AppState.entries.find(e => e.type==='meter' && e.ref===ref);
  if (!dup) { onConfirm(); return; }
  // حفظ الـ callback وفتح modal التنبيه
  window._dupRefCallback = onConfirm;
  const mo = g('dup-ref-mo');
  if (!mo) { onConfirm(); return; }
  const info = g('dup-ref-info');
  if (info) info.innerHTML = `⚠ السند رقم <strong>${ref}</strong> مُسجَّل بالفعل بتاريخ <strong>${fD(dup.date)}</strong>`;
  mo.classList.add('open');
}

/** إضافة سند أمتار */
async function addMeter(forceOverride) {
  if (!AppState.currentUser) return;
  const date     = g('m-date')?.value;
  const ref      = (g('m-ref')?.value||'').trim();
  const plate    = (g('m-plate')?.value||'').trim();
  const rawM     = parseFloat(g('m-raw-meters')?.value);
  const deducted = parseFloat(g('m-deducted')?.value) || 0;
  const time     = g('m-time')?.value || '';
  const shift    = g('m-shift')?.value || 'day';
  const desc     = (g('m-desc')?.value||'').trim();
  const notes    = (g('m-notes')?.value||'').trim();

  if (!date || isNaN(rawM) || rawM <= 0)         { toast('⚠ أدخل التاريخ والكمية الأصلية','err'); return; }
  if (deducted < 0 || deducted > rawM)           { toast('⚠ الخصم لا يمكن أن يتجاوز الكمية الأصلية','err'); return; }

  if (!forceOverride) {
    _checkDupRef(ref, () => addMeter(true));
    return;
  }

  const certifiedM = +(rawM - deducted).toFixed(2);
  const crd        = +(certifiedM * AppState.meterPrice).toFixed(2);
  const noteFull   = [plate?`لوحة: ${plate}`:'', time?`الوقت: ${time}`:'', notes].filter(Boolean).join(' | ');

  try {
    await addDoc(collection(db, COLL.ENTRIES), {
      date, ref, plate, rawMeters: rawM, deducted, met: certifiedM,
      deb: 0, crd, shift,
      desc: desc || (plate ? `سند أمتار — لوحة ${plate}` : 'سند أمتار'),
      notes: noteFull, type: 'meter',
      createdBy:     AppState.currentUser.email,
      createdByName: g('tb-username')?.textContent || '',
      createdAt:     new Date().toISOString()
    });
    clrForm('m');
    toast('✅ تم حفظ سند الأمتار','ok');
    await writeAuditLog('ADD_METER', { ref, plate, cert: certifiedM, crd });
  } catch(e) { toast('⚠ خطأ في الحفظ','err'); }
}

/** إضافة حركة عهدة */
async function addCustody() {
  if (!AppState.currentUser) return;
  const date  = g('c-date')?.value;
  const ref   = (g('c-ref')?.value||'').trim();
  const desc  = (g('c-desc')?.value||'').trim();
  const amt   = parseFloat(g('c-amount')?.value);
  const notes = (g('c-notes')?.value||'').trim();
  if (!date || isNaN(amt) || amt <= 0) { toast('⚠ أدخل التاريخ والمبلغ','err'); return; }

  const isR      = window._cType === 'r';
  const payMethod= window._cPayMethod || 'cash';
  try {
    await addDoc(collection(db, COLL.ENTRIES), {
      date, ref, met: 0, deb: isR ? amt : 0, crd: isR ? 0 : amt,
      desc: desc || (isR ? 'استلام عهدة' : 'تسليم عهدة'),
      notes, type: isR ? 'custody_r' : 'custody_d', payMethod,
      createdBy:     AppState.currentUser.email,
      createdByName: g('tb-username')?.textContent || '',
      createdAt:     new Date().toISOString()
    });
    clrForm('c');
    toast(isR ? '✅ تم استلام العهدة' : '✅ تم تسليم العهدة','ok');
    await writeAuditLog(isR ? 'ADD_CUSTODY_IN' : 'ADD_CUSTODY_OUT', { ref, amt });
  } catch(e) { toast('⚠ خطأ في الحفظ','err'); }
}

/** إضافة مصروف */
async function addExpense() {
  if (!AppState.currentUser) return;
  const date  = g('e-date')?.value;
  const ref   = (g('e-ref')?.value||'').trim();
  const desc  = (g('e-desc')?.value||'').trim();
  const amt   = parseFloat(g('e-amount')?.value);
  const notes = (g('e-notes')?.value||'').trim();
  if (!date || isNaN(amt) || amt <= 0) { toast('⚠ أدخل التاريخ والمبلغ','err'); return; }

  const eType = window._eType || 'fuel';
  let finalType = eType, typeLabel = EL[eType] || '📦 أخرى';
  if (eType === 'custom') {
    const cn = (g('e-custom-type')?.value||'').trim();
    if (!cn) { toast('⚠ أدخل اسم نوع المصروف','err'); return; }
    typeLabel = '✏️ ' + cn; finalType = 'custom_' + cn;
  }
  try {
    await addDoc(collection(db, COLL.ENTRIES), {
      date, ref, met: 0, deb: 0, crd: amt,
      desc: desc || typeLabel, notes, type: 'expense',
      et: finalType, etLabel: typeLabel,
      createdBy:     AppState.currentUser.email,
      createdByName: g('tb-username')?.textContent || '',
      createdAt:     new Date().toISOString()
    });
    clrForm('e');
    toast('✅ تم حفظ المصروف','ok');
    await writeAuditLog('ADD_EXPENSE', { ref, typeLabel, amt });
  } catch(e) { toast('⚠ خطأ في الحفظ','err'); }
}

/** تأكيد الحذف */
let _pendingDelId = null;
function confirmDel(id) {
  _pendingDelId = id;
  g('confirm-mo')?.classList.add('open');
}

async function _executeDelete() {
  if (!_pendingDelId) return;
  try {
    await deleteDoc(doc(db, COLL.ENTRIES, _pendingDelId));
    const id = _pendingDelId;
    _pendingDelId = null;
    closeMo('confirm-mo');
    toast('✅ تم الحذف','ok');
    await writeAuditLog('DELETE_ENTRY', { id });
  } catch(e) { toast('⚠ خطأ في الحذف','err'); }
}

/** فتح نموذج التعديل */
let _editId = null;
function openEdit(id) {
  const e = AppState.entries.find(x => x.id === id);
  if (!e) return;
  _editId = id;
  const fields = { 'ed-date':e.date||'', 'ed-ref':e.ref||'', 'ed-desc':e.desc||'',
                   'ed-deb':e.deb||'', 'ed-crd':e.crd||'', 'ed-met':e.met||'', 'ed-notes':e.notes||'' };
  Object.entries(fields).forEach(([id,val]) => { const el=g(id); if(el) el.value=val; });
  g('edit-mo')?.classList.add('open');
}

async function saveEdit() {
  if (!_editId) return;
  try {
    await updateDoc(doc(db, COLL.ENTRIES, _editId), {
      date:  g('ed-date')?.value  || '',
      ref:   g('ed-ref')?.value   || '',
      desc:  g('ed-desc')?.value  || '',
      deb:   parseFloat(g('ed-deb')?.value)   || 0,
      crd:   parseFloat(g('ed-crd')?.value)   || 0,
      met:   parseFloat(g('ed-met')?.value)   || 0,
      notes: g('ed-notes')?.value || '',
      updatedBy: AppState.currentUser?.email,
      updatedAt: new Date().toISOString()
    });
    closeMo('edit-mo');
    toast('✅ تم التعديل','ok');
    await writeAuditLog('EDIT_ENTRY', { id: _editId });
  } catch(e) { toast('⚠ خطأ في التعديل','err'); }
}

// ══════════════════════════════════════════════
// SETTINGS — الإعدادات
// ══════════════════════════════════════════════
async function saveSettings() {
  const btn = document.querySelector('.btn-blue[onclick="saveSettings()"]');
  if (btn) { btn.textContent='جاري الحفظ...'; btn.disabled=true; }
  const data = {
    companyName:    (g('s-company-name')?.value    || '').trim(),
    contractorName: (g('s-contractor-name')?.value || '').trim(),
    projectName:    (g('s-project-name')?.value    || '').trim(),
    driverPrice:    parseFloat(g('s-driver-price')?.value)  || 14,
    invoicePrice:   parseFloat(g('s-invoice-price')?.value) || 15,
    updatedAt:      new Date().toISOString()
  };
  try {
    await setDoc(doc(db, COLL.SETTINGS, 'system'), data);
    AppState.meterPrice   = data.driverPrice;
    AppState.invoicePrice = data.invoicePrice;
    setEl('sb-system-name',  data.companyName  || 'مسار');
    setEl('sb-project-name', data.projectName  || '');
    applyContractorName(data.contractorName);
    const hintEl = g('m-hint');
    if (hintEl) hintEl.innerHTML = `0 - 0 خصم = <strong>0 م³</strong> × ${data.driverPrice} = <strong>0.00 ر.س</strong>`;
    toast('✅ تم حفظ الإعدادات','ok');
    await writeAuditLog('SAVE_SETTINGS', { company: data.companyName });
  } catch(e) { toast('⚠ خطأ في الحفظ','err'); }
  if (btn) { btn.textContent='💾 حفظ الإعدادات'; btn.disabled=false; }
}

async function deleteAllData() {
  if (!confirm('⚠ حذف جميع البيانات؟\nهذا الإجراء لا يمكن التراجع عنه!\nتأكد من تصدير النسخة الاحتياطية أولاً.')) return;
  if (!confirm('تأكيد نهائي: حذف كل السندات والعهدة والمصروفات؟')) return;
  const btn = g('delete-all-btn');
  if (btn) { btn.textContent='جاري الحذف...'; btn.disabled=true; }
  try {
    const snap = await getDocs(collection(db, COLL.ENTRIES));
    const batch = snap.docs.map(d => deleteDoc(doc(db, COLL.ENTRIES, d.id)));
    await Promise.all(batch);
    await writeAuditLog('DELETE_ALL_DATA', { count: snap.docs.length });
    toast(`✅ تم حذف ${snap.docs.length} سجل`,'ok');
  } catch(e) { toast('⚠ خطأ في الحذف','err'); }
  if (btn) { btn.textContent='حذف الكل'; btn.disabled=false; }
}

// ══════════════════════════════════════════════
// FORM HELPERS — مساعدات النماذج
// ══════════════════════════════════════════════
function calcMeterSummary() {
  const raw  = parseFloat(g('m-raw-meters')?.value) || 0;
  const ded  = parseFloat(g('m-deducted')?.value)   || 0;
  const cert = Math.max(0, +(raw - ded).toFixed(2));
  const amt  = +(cert * AppState.meterPrice).toFixed(2);
  const el   = g('m-certified'); if (el) el.value = cert > 0 ? cert : '';
  const hint  = g('m-hint');
  const hint2 = g('m-hint2');
  if (hint)  hint.innerHTML  = `${raw} - ${ded} خصم = <strong>${cert} م³ معتمد</strong> × ${AppState.meterPrice} = <strong class="price-ok">${fEN(amt)} ر.س</strong>`;
  if (hint2) hint2.textContent = cert > 0 ? `المبلغ للسائق = ${fEN(amt)} ر.س` : 'أدخل الكمية للحساب';
}

function clrForm(p) {
  const today = new Date().toISOString().split('T')[0];
  const fields = {
    m: ['m-ref','m-plate','m-raw-meters','m-deducted','m-certified','m-desc','m-notes'],
    c: ['c-ref','c-desc','c-amount','c-notes'],
    e: ['e-ref','e-desc','e-amount','e-notes','e-custom-type']
  };
  (fields[p]||[]).forEach(id => { const el=g(id); if(el) el.value=''; });
  if (p === 'm') {
    const md = g('m-date'); if (md) md.value = today;
    const hint  = g('m-hint');  if (hint)  hint.innerHTML  = `0 - 0 خصم = <strong>0 م³</strong> × ${AppState.meterPrice} = <strong>0.00 ر.س</strong>`;
    const hint2 = g('m-hint2'); if (hint2) hint2.textContent = 'أدخل الكمية للحساب';
    const tel = g('m-time'); if (tel) tel.value = new Date().toTimeString().slice(0,5);
    const h   = new Date().getHours();
    const sh  = g('m-shift'); if (sh) sh.value = (h>=7&&h<19)?'day':'night';
  }
  if (p === 'c') {
    const cd = g('c-date'); if (cd) cd.value = today;
    window._cPayMethod = 'cash';
    document.querySelectorAll('#cpay-cash,#cpay-transfer').forEach(b => b.classList.remove('act-pay'));
    g('cpay-cash')?.classList.add('act-pay');
  }
  if (p === 'e') {
    const ed = g('e-date'); if (ed) ed.value = today;
    const w  = g('custom-type-wrap'); if (w) w.style.display = 'none';
  }
}

function setCType(t) {
  window._cType = t;
  g('ct-rec').className = 'ctype' + (t==='r'?' act-r':'');
  g('ct-del').className = 'ctype' + (t==='d'?' act-d':'');
  const btn = g('c-savebtn');
  if (t==='r') { btn.textContent='📥 حفظ'; btn.className='btn btn-green'; }
  else         { btn.textContent='📤 حفظ'; btn.className='btn btn-red'; }
}

function setEType(t, el) {
  window._eType = t;
  document.querySelectorAll('.etype').forEach(b => b.classList.remove('act'));
  el.classList.add('act');
  const wrap = g('custom-type-wrap');
  if (wrap) wrap.style.display = (t === 'custom') ? 'block' : 'none';
}

function setCPayMethod(m, el) {
  window._cPayMethod = m;
  document.querySelectorAll('.ctype').forEach(b => b.classList.remove('act-pay'));
  el.classList.add('act-pay');
}

// ══════════════════════════════════════════════
// MODAL HELPERS — مساعدات النوافذ المنبثقة
// ══════════════════════════════════════════════
function closeMo(id) {
  g(id)?.classList.remove('open');
  if (id === 'edit-mo')    _editId       = null;
  if (id === 'confirm-mo') _pendingDelId = null;
}

// ══════════════════════════════════════════════
// SIDEBAR — الشريط الجانبي
// ══════════════════════════════════════════════
function toggleSidebar() { g('sidebar')?.classList.toggle('collapsed'); }
function openSidebar()  { g('sidebar')?.classList.add('mobile-open'); g('sb-overlay')?.classList.add('show'); }
function closeSidebar() { g('sidebar')?.classList.remove('mobile-open'); g('sb-overlay')?.classList.remove('show'); }

// ══════════════════════════════════════════════
// SHIFTS — إقفال الوردية
// ══════════════════════════════════════════════
function openShiftClosure() {
  const mo = g('shift-mo'); if (!mo) return;
  // إعادة تعيين
  const actual = g('shift-actual-amt'); if (actual) actual.value = '';
  const notes  = g('shift-notes'); if (notes) notes.value = '';
  const vrRow  = g('shift-variance-row'); if (vrRow) vrRow.style.display = 'none';

  if (AppState.currentRole === 'admin') {
    const wrap = g('shift-user-wrap'); if (wrap) wrap.style.display = 'block';
    const sel  = g('shift-user-select'); if (!sel) { mo.classList.add('open'); return; }
    const users = {}; AppState.entries.forEach(e => { if (e.createdBy) users[e.createdBy] = e.createdByName||e.createdBy; });
    sel.innerHTML = Object.entries(users).map(([em,nm]) => `<option value="${em}">${nm} (${em})</option>`).join('');
    sel.innerHTML += `<option value="__all__">🌐 الكل</option>`;
    updateShiftView();
  } else {
    const wrap = g('shift-user-wrap'); if (wrap) wrap.style.display = 'none';
    updateShiftView();
  }
  mo.classList.add('open');
}

function updateShiftView() {
  const selectedEmail = AppState.currentRole === 'admin'
    ? (g('shift-user-select')?.value || '__all__')
    : AppState.currentUser?.email;

  const relevant = AppState.entries.filter(e => {
    if (selectedEmail === '__all__') return true;
    return e.createdBy === selectedEmail;
  });

  let bal = 0;
  const asc = [...relevant].sort((a,b) => (a.createdAt||'').localeCompare(b.createdAt||''));
  asc.forEach(e => { bal += (e.deb||0) - (e.crd||0); });
  setEl('shift-system-bal', `${fEN(bal)} ر.س`);
  g('shift-system-bal').style.color = bal >= 0 ? 'var(--green)' : 'var(--red)';
  calcShiftVariance();
}

function calcShiftVariance() {
  const actual    = parseFloat(g('shift-actual-amt')?.value);
  const sysBalStr = g('shift-system-bal')?.textContent || '0';
  const sysBal    = parseFloat(sysBalStr.replace(/,/g,'').replace('ر.س','').trim()) || 0;
  if (isNaN(actual)) { const vr=g('shift-variance-row'); if(vr)vr.style.display='none'; return; }
  const diff = +(actual - sysBal).toFixed(2);
  const vrRow = g('shift-variance-row'); if (vrRow) vrRow.style.display = 'block';
  setEl('shift-variance-val', `${diff >= 0 ? '+' : ''}${fEN(diff)} ر.س`);
  const lbl = g('shift-variance-lbl');
  if (lbl) {
    lbl.textContent = diff === 0 ? '✅ متطابق' : diff > 0 ? '📈 زيادة' : '📉 نقص';
    lbl.style.color = diff === 0 ? 'var(--green)' : diff > 0 ? 'var(--b600)' : 'var(--red)';
  }
  const valEl = g('shift-variance-val');
  if (valEl) valEl.style.color = diff === 0 ? 'var(--green)' : diff > 0 ? 'var(--b600)' : 'var(--red)';
}

async function saveShiftClosure() {
  const actual = parseFloat(g('shift-actual-amt')?.value);
  if (isNaN(actual) || actual < 0) { toast('⚠ أدخل المبلغ الفعلي','err'); return; }

  const sysBalStr = g('shift-system-bal')?.textContent || '0';
  const sysBal    = parseFloat(sysBalStr.replace(/,/g,'').replace('ر.س','').trim()) || 0;
  const notes     = (g('shift-notes')?.value || '').trim();
  const diff      = +(actual - sysBal).toFixed(2);
  const selectedEmail = AppState.currentRole === 'admin' ? (g('shift-user-select')?.value||'__all__') : AppState.currentUser?.email;

  const btn = g('shift-save-btn');
  if (btn) { btn.textContent='جاري الإقفال...'; btn.disabled=true; }
  try {
    await addDoc(collection(db, COLL.SHIFTS), {
      closedBy:       AppState.currentUser.email,
      closedByName:   g('tb-username')?.textContent || '',
      forUser:        selectedEmail,
      systemBalance:  sysBal,
      actualAmount:   actual,
      variance:       diff,
      notes,
      closedAt:       new Date().toISOString()
    });
    closeMo('shift-mo');
    await renderShifts();
    toast(`✅ تم إقفال الوردية — الفارق: ${fEN(diff)} ر.س`,'ok');
    await writeAuditLog('SHIFT_CLOSURE', { actual, sysBal, diff });
  } catch(e) { toast('⚠ خطأ في الإقفال','err'); }
  if (btn) { btn.textContent='🔒 تأكيد الإقفال'; btn.disabled=false; }
}

async function renderShifts() {
  const el = g('shifts-list'); if (!el) return;
  el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:.8rem">جاري التحميل...</div>';
  try {
    const snap = await getDocs(collection(db, COLL.SHIFTS));
    const shifts = []; snap.forEach(d => shifts.push({id:d.id,...d.data()}));
    shifts.sort((a,b) => (b.closedAt||'').localeCompare(a.closedAt||''));
    if (!shifts.length) { el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3)">لا توجد إقفالات بعد</div>'; return; }
    el.innerHTML = shifts.map(s => {
      const dt = s.closedAt ? new Date(s.closedAt).toLocaleString('ar-SA',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      const diffBadge = s.variance===0 ? 'background:#dcfce7;color:#15803d' : s.variance>0 ? 'background:#dbeafe;color:#1d4ed8' : 'background:#fee2e2;color:#b91c1c';
      return `<div class="shift-row">
        <div class="shift-hd">
          <span class="shift-user">${s.closedByName||s.closedBy}</span>
          <span class="shift-badge" style="${diffBadge};border:1px solid currentColor">الفارق: ${s.variance>=0?'+':''}${fEN(s.variance)} ر.س</span>
        </div>
        <div class="shift-time">📅 ${dt} ${s.forUser&&s.forUser!='__all__'?`| 👤 ${s.forUser}`:''}</div>
        <div class="shift-stats">
          <div class="sst"><div class="sst-l">الرصيد النظامي</div><div class="sst-v">${fEN(s.systemBalance)} ر.س</div></div>
          <div class="sst"><div class="sst-l">المبلغ الفعلي</div><div class="sst-v">${fEN(s.actualAmount)} ر.س</div></div>
          <div class="sst"><div class="sst-l">الفارق</div><div class="sst-v" style="${diffBadge};padding:3px 6px;border-radius:6px">${s.variance>=0?'+':''}${fEN(s.variance)}</div></div>
        </div>
        ${s.notes?`<div class="shift-note">📝 ${s.notes}</div>`:''}
        ${AppState.currentRole==='admin'?`<div style="margin-top:8px"><button class="sg-btn danger" style="font-size:.68rem;padding:3px 10px" onclick="deleteShiftRecord('${s.id}')">🗑 حذف</button></div>`:''}
      </div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div style="padding:16px;color:var(--red);text-align:center">خطأ في التحميل</div>'; }
}

async function deleteShiftRecord(id) {
  if (!confirm('حذف هذا الإقفال؟')) return;
  try {
    await deleteDoc(doc(db, COLL.SHIFTS, id));
    await renderShifts();
    toast('✅ تم الحذف','ok');
  } catch(e) { toast('⚠ خطأ في الحذف','err'); }
}

// ══════════════════════════════════════════════
// RECONCILIATION — المطابقة
// ══════════════════════════════════════════════
window._recRows = [];
function addRecRow() {
  window._recRows.push({ slNo: window._recRows.length+1, date:'', truck:'', tripSheet:'', rawM:0, deducted:0, certM:0 });
  renderRecTable();
}
function removeRecRow(i) {
  window._recRows.splice(i,1);
  renderRecTable();
}
function renderRecTable() {
  const tb = g('rec-input-tbody'); if (!tb) return;
  if (!window._recRows.length) { tb.innerHTML='<tr><td colspan="8" style="padding:16px;text-align:center;color:var(--text3)">اضغط "إضافة صف" لبدء إدخال بيانات الكشف</td></tr>'; return; }
  tb.innerHTML = window._recRows.map((r,i) => `<tr>
    <td>${r.slNo||i+1}</td>
    <td><input type="date" value="${r.date}" oninput="_recRows[${i}].date=this.value" style="min-width:120px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="text" value="${r.truck}" placeholder="رقم الشاحنة" oninput="_recRows[${i}].truck=this.value" style="min-width:100px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="text" value="${r.tripSheet}" placeholder="رقم القسيمة" oninput="_recRows[${i}].tripSheet=this.value" style="min-width:100px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="number" value="${r.rawM||''}" placeholder="0" min="0" step="0.5" oninput="_recRows[${i}].rawM=parseFloat(this.value)||0;_calcRecRow(${i})" style="min-width:90px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="number" value="${r.deducted||''}" placeholder="0" min="0" step="0.5" oninput="_recRows[${i}].deducted=parseFloat(this.value)||0;_calcRecRow(${i})" style="min-width:90px;padding:5px 8px;font-size:.8rem"></td>
    <td style="font-weight:800;color:var(--b600)">${r.certM||0}م</td>
    <td><button onclick="removeRecRow(${i})" style="background:var(--red2);border:1px solid var(--red);border-radius:5px;padding:3px 10px;cursor:pointer;font-size:.8rem;color:var(--red)">✕</button></td>
  </tr>`).join('');
}
function _calcRecRow(i) {
  const r = window._recRows[i]; if (!r) return;
  r.certM = +(Math.max(0, r.rawM - r.deducted)).toFixed(2);
  const cells = g('rec-input-tbody')?.rows[i]?.cells;
  if (cells && cells[6]) cells[6].textContent = r.certM+'م';
}

function _runReconcile() {
  if (!window._recRows.length) { toast('⚠ أضف صفوفاً في جدول الكشف','err'); return; }
  const meterEntries = AppState.entries.filter(e => e.type === 'meter');
  const from = g('rec-from')?.value||''; const to = g('rec-to')?.value||'';
  const filtered = from||to ? meterEntries.filter(e => (!from||e.date>=from)&&(!to||e.date<=to)) : meterEntries;
  runReconcile(window._recRows, filtered, AppState.invoicePrice);
}

// ══════════════════════════════════════════════
// PERMISSION TOGGLES — تبديل الصلاحيات
// ══════════════════════════════════════════════
function togglePerm(card) {
  card.classList.toggle('selected');
  const cb = card.querySelector('.perm-check'); if (cb) cb.checked = card.classList.contains('selected');
}
function toggleEpPerm(card) {
  card.classList.toggle('selected');
  const cb = card.querySelector('.perm-check'); if (cb) cb.checked = card.classList.contains('selected');
}

// ══════════════════════════════════════════════
// PWA — Progressive Web App
// ══════════════════════════════════════════════
function _initPWA() {
  const compassSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="112" fill="#0f172a"/>
    <rect x="32" y="32" width="448" height="448" rx="96" fill="#1d4ed8"/>
    <circle cx="256" cy="256" r="160" fill="#1e40af"/>
    <circle cx="256" cy="256" r="148" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/>
    <circle cx="256" cy="256" r="120" fill="#1e3a8a"/>
    <circle cx="256" cy="256" r="10" fill="white"/>
    <polygon points="256,120 244,252 256,246 268,252" fill="#f87171"/>
    <polygon points="256,392 244,260 256,266 268,260" fill="white" opacity="0.85"/>
    <polygon points="120,256 252,244 246,256 252,268" fill="white" opacity="0.85"/>
    <polygon points="392,256 260,244 266,256 260,268" fill="#f87171"/>
  </svg>`;
  const iconDataUrl = 'data:image/svg+xml,' + encodeURIComponent(compassSVG);
  const manifest = {
    name:'مسار', short_name:'مسار', start_url:'./', display:'standalone',
    orientation:'portrait', background_color:'#0f172a', theme_color:'#1d4ed8',
    lang:'ar', dir:'rtl',
    icons:[
      { src:iconDataUrl, sizes:'192x192', type:'image/svg+xml', purpose:'any' },
      { src:iconDataUrl, sizes:'512x512', type:'image/svg+xml', purpose:'any maskable' }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type:'application/json' });
  const pwaEl = g('pwa-manifest'); if (pwaEl) pwaEl.href = URL.createObjectURL(blob);
  const appleEl = g('dyn-apple-icon'); if (appleEl) appleEl.href = iconDataUrl;
  const favEl   = g('dyn-favicon');    if (favEl)   favEl.href   = iconDataUrl;
}

// ══════════════════════════════════════════════
// ERROR HANDLING — معالجة الأخطاء
// ══════════════════════════════════════════════
function _showErrorScreen(message) {
  hideSplash();
  const errScreen = g('error-screen');
  if (errScreen) {
    errScreen.style.display = 'flex';
    const msgEl = errScreen.querySelector('.error-msg');
    if (msgEl) msgEl.textContent = message || 'حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.';
  }
}

window.onerror = function(message, source, lineno, colno, error) {
  console.error('[GlobalError]', { message, source, lineno, error });
  // لا نعرض شاشة الخطأ لكل خطأ صغير — فقط للأخطاء الكبيرة
  if (error instanceof TypeError && error.message.includes('Cannot read')) {
    toast('⚠ خطأ في المعالجة — حاول مرة أخرى','err');
  }
  return false; // السماح للمتصفح بمعالجة الخطأ أيضاً
};

window.addEventListener('unhandledrejection', event => {
  console.error('[UnhandledPromise]', event.reason);
  const msg = event.reason?.message || '';
  if (msg.includes('auth/')) {
    toast('⚠ خطأ في المصادقة — أعد تسجيل الدخول','err');
  } else if (msg.includes('firestore') || msg.includes('permission')) {
    toast('⚠ خطأ في قاعدة البيانات — تحقق من الاتصال','err');
  }
});

// ══════════════════════════════════════════════
// WINDOW ASSIGNMENTS — تعيين الدوال لـ window
// (مطلوبة لـ onclick="" في HTML)
// ══════════════════════════════════════════════
window.doLogin              = doLogin;
window.doLogout             = () => doLogout(AppState.unsubEntries);
window.showPage             = showPage;
window.navTo                = navTo;
window.addMeter             = addMeter;
window.addCustody           = addCustody;
window.addExpense           = addExpense;
window.confirmDel           = confirmDel;
window.openEdit             = openEdit;
window.saveEdit             = saveEdit;
window.closeMo              = closeMo;
window.toast                = toast;
window.setCType             = setCType;
window.setEType             = setEType;
window.setCPayMethod        = setCPayMethod;
window.calcMeterSummary     = calcMeterSummary;
window.calcFromMeters       = calcMeterSummary;
window.calcFromAmount       = () => {};
window.clrForm              = clrForm;
window.togglePerm           = togglePerm;
window.toggleEpPerm         = toggleEpPerm;
window.toggleSidebar        = toggleSidebar;
window.openSidebar          = openSidebar;
window.closeSidebar         = closeSidebar;
window.renderLedger         = renderLedger;
window.saveSettings         = saveSettings;
window.deleteAllData        = deleteAllData;
window.applyContractorName  = applyContractorName;
// Shifts
window.openShiftClosure     = openShiftClosure;
window.updateShiftView      = updateShiftView;
window.calcShiftVariance    = calcShiftVariance;
window.saveShiftClosure     = saveShiftClosure;
window.deleteShiftRecord    = deleteShiftRecord;
// Reconcile
window.addRecRow            = addRecRow;
window.removeRecRow         = removeRecRow;
window.runReconcile         = _runReconcile;
window._calcRecRow          = _calcRecRow;
// Users
window.addUser              = addUser;
window.renderUsersList      = renderUsersList;
window.softDeleteUser       = softDeleteUser;
window.reactivateUser       = reactivateUser;
window.hardDeleteUser       = hardDeleteUser;
window.openEditPermissions  = openEditPermissions;
window.saveEditPermissions  = saveEditPermissions;
// Exports
window.exportExcel          = exportExcel;
window.exportPDF            = exportPDF;
window.exportShortPDF       = exportShortPDF;
window.exportShortExcel     = exportShortExcel;
window.exportUserReportPDF  = exportUserReportPDF;
window.exportUserReportExcel= exportUserReportExcel;
window.exportJSON           = () => exportJSON(AppState.currentUser, writeAuditLog);
window.importJSON           = () => importJSON(AppState.currentUser, writeAuditLog);
window.loadAuditLog         = loadAuditLog;
window.updateReportFilter   = updateReportFilter;
window.setExpDate           = setExpDate;
// Reports
window.openUserReport       = openUserReport;
window.renderUserReportTable= renderUserReportTable;
// Dup-ref modal
window._dupRefCallback      = null;
window.confirmDupRef        = function() {
  closeMo('dup-ref-mo');
  if (typeof window._dupRefCallback === 'function') { window._dupRefCallback(); window._dupRefCallback=null; }
};

// ══════════════════════════════════════════════
// INITIALIZATION — التهيئة الرئيسية
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // تهيئة الـ modules
  initReports(ctx);
  initExports(ctx);
  initUsers(ctx, DEFAULT_PERMS, ALL_PAGES);
  initAuth(onLoginSuccess, onLogout, DEFAULT_PERMS);

  // تهيئة الـ state الأولية للنماذج
  window._cType      = 'r';
  window._cPayMethod = 'cash';
  window._eType      = 'fuel';

  // زر الحذف في modal التأكيد
  const delBtn = g('confirm-del-btn');
  if (delBtn) delBtn.onclick = _executeDelete;

  // إغلاق الـ modals بالضغط خارجها
  ['edit-mo','confirm-mo','shift-mo','user-report-mo','edit-perms-mo','dup-ref-mo'].forEach(id => {
    const el = g(id);
    if (el) el.addEventListener('click', function(e) { if(e.target===this) closeMo(id); });
  });

  // ── زر الرجوع في Android ──
  // نستخدم popstate مع pushState مرة واحدة عند بدء التطبيق
  window.addEventListener('popstate', () => {
    if (!AppState.currentUser) return; // لم يسجل دخول بعد
    const target = _navHistory.pop() || 'pg-dash';
    if (AppState.currentPageId === target) return;
    // تنقل للصفحة السابقة بدون إضافة لـ history
    AppState.currentPageId = target;
    document.querySelectorAll('.sb-item').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-page') === target));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = g(target); if (pg) pg.classList.add('active');
    setEl('pg-title', PAGE_TITLES[target] || '');
    // أعد وضع الـ dummy state حتى يعمل زر الرجوع مرة أخرى
    history.pushState(null, '', '');
  });

  // expose renderMeters/Custody/Expenses/Ledger for loadMore buttons
  window.renderMeters   = renderMeters;
  window.renderCustody  = renderCustody;
  window.renderExpenses = renderExpenses;

  // Debounced search في سجل العمليات
  let _debounceTimer;
  const searchInput = g('l-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(renderLedger, 280);
    });
  }

  // Offline / Online events
  window.addEventListener('offline', () => {
    g('offline-badge')?.classList.add('show');
    toast('⚡ غير متصل — البيانات محفوظة محلياً','');
  });
  window.addEventListener('online', () => {
    g('offline-badge')?.classList.remove('show');
    toast('✅ عاد الاتصال بالإنترنت','ok');
  });
  if (!navigator.onLine) g('offline-badge')?.classList.add('show');

  // PWA
  _initPWA();
});
