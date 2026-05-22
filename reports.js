// ══════════════════════════════════════════════════════════
// reports.js — دوال العرض والتقارير والمخططات
// ══════════════════════════════════════════════════════════

import { db, COLL, collection, getDocs } from './firebase.js';

// ── Context يُحدَّث من app.js ──
let _ctx = null;
export function initReports(ctx) { _ctx = ctx; }

// ── Pagination State ──
const PAGE_SIZE = 20;
const _pages = { meters: PAGE_SIZE, custody: PAGE_SIZE, expenses: PAGE_SIZE, ledger: PAGE_SIZE };
export function resetPages() { Object.keys(_pages).forEach(k => _pages[k] = PAGE_SIZE); }

const g   = id => document.getElementById(id);
const get = ()  => _ctx.getState();
const h   = ()  => _ctx.helpers;

function moreBtn(renderFnName, cols, total, shown) {
  const rem = total - shown;
  if (rem <= 0) return '';
  return `<tr><td colspan="${cols}" style="padding:0">
    <button onclick="${renderFnName}(true)"
      style="width:100%;padding:12px;background:var(--b100);border:none;border-top:1px solid var(--line);
             color:var(--b600);font-family:Tajawal,sans-serif;font-size:.82rem;font-weight:800;cursor:pointer">
      ⬇ تحميل المزيد (${rem} سجل متبقي)
    </button></td></tr>`;
}

function emptyTable(tbodyId, cols) {
  const tb = g(tbodyId);
  if (tb) tb.innerHTML = `<tr><td colspan="${cols}" style="padding:28px;color:var(--text3);text-align:center;font-size:.82rem">لا توجد بيانات بعد</td></tr>`;
}

/** أزرار تعديل/حذف */
function actionBtns(id, canEdit) {
  return canEdit
    ? `<td class="td-act"><button class="eb" onclick="openEdit('${id}')" title="تعديل">✏️</button><button onclick="confirmDel('${id}')" title="حذف">🗑</button></td>`
    : '<td></td>';
}

// ══════════════════════════════
// سندات الأمتار
// ══════════════════════════════
export function renderMeters(loadMore = false) {
  const { entries, currentUser, currentRole } = get();
  const { allBalances, fEN, fENn, fD, bCls, EL, TL, setEl } = h();
  const bals = allBalances();
  const rows = entries.filter(e => e.type === 'meter');
  const tb   = g('m-tbody');
  if (loadMore) _pages.meters += PAGE_SIZE;
  const shown = Math.min(_pages.meters, rows.length);
  setEl('m-lbl', rows.length + ' سجل');
  if (!tb) return;
  if (!rows.length) { emptyTable('m-tbody', 12); return; }

  const displayRows = rows.slice(0, shown);
  const frag = document.createDocumentFragment();
  displayRows.forEach((e, i) => {
    const canEdit = currentRole === 'admin' || e.createdBy === currentUser?.email;
    const b       = bals[e.id];
    const shiftBadge = e.shift === 'night'
      ? '<span class="badge" style="background:#1e3a5f;color:#93c5fd;border:1px solid #2563eb">🌙 م</span>'
      : '<span class="badge" style="background:#fef9c3;color:#92400e;border:1px solid #d97706">☀️ ص</span>';
    const raw  = (e.rawMeters !== undefined ? e.rawMeters : e.met) || 0;
    const ded  = e.deducted || 0;
    const cert = e.met || 0;
    const tr   = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text3);font-size:.7rem">${rows.length - i}</td>
      <td>${fD(e.date)}</td>
      <td>${shiftBadge}</td>
      <td><strong>${_esc(e.ref) || '—'}</strong></td>
      <td>${_esc(e.plate) || ((e.notes||'').split('|')[0].replace('لوحة:','').trim()) || '—'}</td>
      <td style="color:var(--text3)">${raw}م</td>
      <td style="color:var(--red);font-weight:700">${ded ? ded+'م' : '—'}</td>
      <td style="color:var(--b600);font-weight:800">${cert}م</td>
      <td class="td-crd">${fEN(e.crd)}</td>
      <td class="${bCls(b)}">${fEN(b)}</td>
      <td style="font-size:.68rem;color:var(--text3)">${_esc(e.createdByName || e.createdBy) || '—'}</td>
      ${actionBtns(e.id, canEdit)}`;
    frag.appendChild(tr);
  });
  tb.innerHTML = '';
  tb.appendChild(frag);
  // زر تحميل المزيد
  const moreTr = document.createElement('tbody');
  moreTr.innerHTML = moreBtn('renderMeters', 12, rows.length, shown);
  if (moreTr.firstChild) tb.appendChild(moreTr.firstChild);
}

// ══════════════════════════════
// العهدة
// ══════════════════════════════
export function renderCustody(loadMore = false) {
  const { entries, currentUser, currentRole } = get();
  const { allBalances, fEN, fD, bCls, setEl } = h();
  const bals = allBalances();
  const rows = entries.filter(e => e.type === 'custody_r' || e.type === 'custody_d');
  const tb   = g('c-tbody');
  if (loadMore) _pages.custody += PAGE_SIZE;
  const shown = Math.min(_pages.custody, rows.length);
  setEl('c-lbl', rows.length + ' سجل');
  if (!tb) return;
  if (!rows.length) { emptyTable('c-tbody', 11); return; }

  const displayRows = rows.slice(0, shown);
  const frag = document.createDocumentFragment();
  displayRows.forEach((e, i) => {
    const canEdit  = currentRole === 'admin' || e.createdBy === currentUser?.email;
    const b        = bals[e.id];
    const isR      = e.type === 'custody_r';
    const badge    = isR ? '<span class="badge badge-in">📥 استلام</span>' : '<span class="badge badge-out">📤 تسليم</span>';
    const payBadge = e.payMethod === 'transfer'
      ? '<span class="badge" style="background:var(--b100);color:var(--b600);border:1px solid var(--b200)">🏦 تحويل</span>'
      : '<span class="badge" style="background:var(--green2);color:var(--green);border:1px solid #86efac">💵 نقدي</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text3);font-size:.7rem">${rows.length - i}</td>
      <td>${fD(e.date)}</td>
      <td><strong>${_esc(e.ref) || '—'}</strong></td>
      <td style="text-align:right">${_esc(e.desc)}</td>
      <td>${badge}</td><td>${payBadge}</td>
      <td class="td-deb">${e.deb ? fEN(e.deb) : ''}</td>
      <td class="td-crd">${e.crd ? fEN(e.crd) : ''}</td>
      <td class="${bCls(b)}">${fEN(b)}</td>
      <td style="font-size:.68rem;color:var(--text3)">${_esc(e.createdByName) || '—'}</td>
      ${actionBtns(e.id, canEdit)}`;
    frag.appendChild(tr);
  });
  tb.innerHTML = '';
  tb.appendChild(frag);
  const moreTr = document.createElement('tbody');
  moreTr.innerHTML = moreBtn('renderCustody', 11, rows.length, shown);
  if (moreTr.firstChild) tb.appendChild(moreTr.firstChild);
}

// ══════════════════════════════
// المصروفات
// ══════════════════════════════
export function renderExpenses(loadMore = false) {
  const { entries, currentUser, currentRole } = get();
  const { allBalances, fEN, fD, bCls, EL, setEl } = h();
  const bals = allBalances();
  const rows = entries.filter(e => e.type === 'expense');
  const tb   = g('e-tbody');
  if (loadMore) _pages.expenses += PAGE_SIZE;
  const shown = Math.min(_pages.expenses, rows.length);
  setEl('e-lbl', rows.length + ' سجل');
  if (!tb) return;
  if (!rows.length) { emptyTable('e-tbody', 9); return; }

  const displayRows = rows.slice(0, shown);
  const frag = document.createDocumentFragment();
  displayRows.forEach((e, i) => {
    const canEdit = currentRole === 'admin' || e.createdBy === currentUser?.email;
    const b       = bals[e.id];
    const label   = e.etLabel || EL[e.et] || '📦 أخرى';
    const tr      = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text3);font-size:.7rem">${rows.length - i}</td>
      <td>${fD(e.date)}</td>
      <td><strong>${_esc(e.ref) || '—'}</strong></td>
      <td><span class="badge badge-exp">${_esc(label)}</span></td>
      <td style="text-align:right">${_esc(e.desc)}</td>
      <td class="td-crd">${fEN(e.crd)}</td>
      <td class="${bCls(b)}">${fEN(b)}</td>
      <td style="font-size:.68rem;color:var(--text3)">${_esc(e.createdByName) || '—'}</td>
      ${actionBtns(e.id, canEdit)}`;
    frag.appendChild(tr);
  });
  tb.innerHTML = '';
  tb.appendChild(frag);
  const moreTr = document.createElement('tbody');
  moreTr.innerHTML = moreBtn('renderExpenses', 9, rows.length, shown);
  if (moreTr.firstChild) tb.appendChild(moreTr.firstChild);
}

// ══════════════════════════════
// سجل العمليات (مع فلاتر متقدمة)
// ══════════════════════════════
export function renderLedger(loadMore = false) {
  const { entries } = get();
  const { allBalances, fEN, fD, bCls, EL, TL, setEl } = h();

  const search = (g('l-search')?.value  || '').toLowerCase().trim();
  const ftype  = g('l-type')?.value     || 'all';
  const from   = g('l-from')?.value     || '';
  const to     = g('l-to')?.value       || '';
  const fref   = (g('l-ref')?.value     || '').toLowerCase().trim();
  const fplate = (g('l-plate')?.value   || '').toLowerCase().trim();
  const fshift = g('l-shift')?.value    || 'all';

  const rows = entries.filter(e => {
    if (ftype === 'meter'   && e.type !== 'meter')   return false;
    if (ftype === 'expense' && e.type !== 'expense') return false;
    if (ftype === 'custody' && e.type !== 'custody_r' && e.type !== 'custody_d') return false;
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    if (fref && !(e.ref||'').toLowerCase().includes(fref)) return false;
    if (fplate) {
      const pl = (e.plate || (e.notes||'').split('|')[0].replace('لوحة:','').trim() || '').toLowerCase();
      if (!pl.includes(fplate)) return false;
    }
    if (fshift !== 'all' && e.type === 'meter' && e.shift !== fshift) return false;
    if (search && ![(e.desc||''),(e.ref||''),(e.notes||''),(e.createdByName||'')].join(' ').toLowerCase().includes(search)) return false;
    return true;
  });

  const tb = g('l-tbody');
  if (loadMore) _pages.ledger += PAGE_SIZE;
  const shown = Math.min(_pages.ledger, rows.length);
  const filterChanged = !loadMore;
  if (filterChanged) _pages.ledger = PAGE_SIZE;
  const displayRows = rows.slice(0, Math.min(_pages.ledger, rows.length));
  setEl('l-lbl', `${rows.length} / ${entries.length} حركة`);
  if (!tb) return;
  if (!rows.length) { emptyTable('l-tbody', 12); return; }

  const bals = allBalances();
  const frag = document.createDocumentFragment();
  displayRows.forEach((e, i) => {
    const b     = bals[e.id];
    const bCl   = e.type === 'meter' ? 'badge-meter' : e.type === 'expense' ? 'badge-exp' : e.type === 'custody_r' ? 'badge-in' : 'badge-out';
    const plate = e.type === 'meter' && e.notes ? (e.notes.split('|')[0].replace('لوحة:','').trim() || '—') : '—';
    const label = e.type === 'expense' ? (e.etLabel || EL[e.et] || '📦 أخرى') : (TL[e.type] || e.type);
    const tr    = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text3);font-size:.7rem">${rows.length - i}</td>
      <td>${fD(e.date)}</td>
      <td><strong>${_esc(e.ref) || '—'}</strong></td>
      <td style="color:var(--text2);font-weight:700">${_esc(plate)}</td>
      <td><span class="badge ${bCl}">${_esc(label)}</span></td>
      <td style="text-align:right;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(e.desc)}</td>
      <td style="color:var(--b600);font-weight:700">${e.met ? e.met+'م' : '—'}</td>
      <td class="td-deb">${e.deb ? fEN(e.deb) : ''}</td>
      <td class="td-crd">${e.crd ? fEN(e.crd) : ''}</td>
      <td class="${bCls(b)}">${fEN(b)}</td>
      <td style="font-size:.68rem;color:var(--b500);font-weight:700">${_esc(e.createdByName||e.createdBy) || '—'}</td>
      <td style="font-size:.68rem;color:var(--text3)">${_esc(e.notes) || '—'}</td>`;
    frag.appendChild(tr);
  });
  tb.innerHTML = '';
  tb.appendChild(frag);
}

// ══════════════════════════════
// تحديث ملخص الداشبورد والتقارير
// ══════════════════════════════
export function updateSummary() {
  const { entries, meterPrice, invoicePrice } = get();
  const { fEN, fENn, setEl, allBalances } = h();

  let deb=0, crd=0, met=0, invM=0, invE=0, invC=0, totExp=0;
  let totalDriverPay=0, totalRevenue=0, dayCert=0, nightCert=0;

  entries.forEach(e => {
    deb += (e.deb||0); crd += (e.crd||0); met += (e.met||0);
    if (e.type === 'meter') {
      invM++;
      totalDriverPay += (e.crd||0);
      totalRevenue   += (e.met||0) * invoicePrice;
      if (e.shift === 'night') nightCert += (e.met||0);
      else dayCert += (e.met||0);
    }
    if (e.type === 'expense')  { invE++; totExp += (e.crd||0); }
    if (e.type === 'custody_r' || e.type === 'custody_d') invC++;
  });

  const netProfit = totalRevenue - totalDriverPay - totExp;
  const margin    = totalRevenue > 0 ? +((netProfit / totalRevenue) * 100).toFixed(1) : 0;
  const bal       = deb - crd;

  // P&L Dashboard
  setEl('pl-revenue',    fEN(totalRevenue) + ' ر.س');
  setEl('pl-driver',     fEN(totalDriverPay) + ' ر.س');
  setEl('pl-expense',    fEN(totExp) + ' ر.س');
  setEl('pl-day-cert',   fENn(dayCert) + 'م');
  setEl('pl-night-cert', fENn(nightCert) + 'م');
  setEl('pl-total-cert', fENn(met) + 'م');

  const plNp = g('pl-net');
  if (plNp) { plNp.textContent = fEN(netProfit) + ' ر.س'; plNp.style.color = netProfit >= 0 ? 'var(--green)' : 'var(--red)'; }
  const plMg = g('pl-margin');
  if (plMg) { plMg.textContent = margin + '%'; plMg.style.color = margin >= 0 ? 'var(--green)' : 'var(--red)'; }

  // Balance Hero
  const dbalEl = g('d-bal');
  if (dbalEl) { dbalEl.innerHTML = fEN(bal) + ' <span style="font-size:.9rem;opacity:.6">ر.س</span>'; dbalEl.className = 'bh-val' + (bal < 0 ? ' neg' : ''); }

  setEl('d-deb',          fEN(deb));
  setEl('d-crd',          fEN(crd));
  setEl('d-total-entries', entries.length + ' حركة مسجلة');
  setEl('d-cnt-m',        fENn(invM));
  setEl('d-cnt-e',        fENn(invE));
  setEl('d-cnt-c',        fENn(invC));
  setEl('d-met-total-card', fENn(met) + ' م');
  setEl('d-exp-total',    fEN(totExp) + ' ر.س إجمالاً');

  const greetEl = g('dash-greeting');
  if (greetEl) greetEl.textContent = entries.length
    ? `${entries.length} حركة مسجلة — الرصيد ${fEN(bal)} ر.س`
    : 'لا توجد بيانات — ابدأ بتسجيل سند أمتار أو حركة عهدة';

  const rb = g('r-bal');
  if (rb) { rb.textContent = fEN(bal); rb.style.color = bal >= 0 ? 'var(--green)' : 'var(--red)'; }
  setEl('r-rec',   fEN(deb));
  setEl('r-out',   fEN(crd));
  setEl('r-met',   fENn(met));
  setEl('r-inv-m', fENn(invM));
  setEl('r-inv-e', fENn(invE));
  setEl('r-inv-c', fENn(invC));
  setEl('r-cnt',   fENn(entries.length));
  setEl('sb-badge-m', fENn(invM));
  setEl('sb-badge-c', fENn(invC));
  setEl('sb-badge-e', fENn(invE));

  renderBreakdown();
  renderRecentTable();
  renderDashRecentTable();
  renderActivityLog();
  renderCharts();
}

// ══════════════════════════════
// تفصيل المصروفات
// ══════════════════════════════
function renderBreakdown() {
  const { entries } = get();
  const { fEN, EL } = h();
  const map = {};
  entries.filter(e => e.type === 'expense').forEach(e => {
    const k = e.etLabel || EL[e.et] || '📦 أخرى';
    map[k] = (map[k]||0) + (e.crd||0);
  });
  const el = g('r-breakdown');
  if (!el) return;
  if (!Object.keys(map).length) {
    el.innerHTML = '<p style="color:var(--text3);text-align:center;padding:14px">لا توجد مصروفات بعد</p>';
    return;
  }
  const total = Object.values(map).reduce((s,v) => s+v, 0);
  el.innerHTML = Object.entries(map).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
    const pct = total ? Math.round(v / total * 100) : 0;
    return `<div class="brow"><div class="brow-top"><span class="brow-label">${k}</span><span class="brow-val">${fEN(v)} ر.س (${pct}%)</span></div><div class="brow-bar-bg"><div class="brow-bar" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

// ══════════════════════════════
// آخر الحركات (صفحة التقارير)
// ══════════════════════════════
function renderRecentTable() {
  const { entries } = get();
  const { allBalances, fEN, fD, bCls, TL } = h();
  const tb   = g('r-recent');
  if (!tb) return;
  const bals = allBalances();
  const recent = [...entries].slice(0, 10);
  if (!recent.length) { emptyTable('r-recent', 7); return; }
  tb.innerHTML = recent.map(e => {
    const b   = bals[e.id];
    const bCl = e.type === 'meter' ? 'badge-meter' : e.type === 'expense' ? 'badge-exp' : e.type === 'custody_r' ? 'badge-in' : 'badge-out';
    return `<tr>
      <td>${fD(e.date)}</td>
      <td><span class="badge ${bCl}">${TL[e.type]||e.type}</span></td>
      <td style="text-align:right">${_esc(e.desc)}</td>
      <td style="color:var(--b500);font-weight:700;font-size:.75rem">${_esc(e.createdByName) || '—'}</td>
      <td class="td-deb">${e.deb ? fEN(e.deb) : ''}</td>
      <td class="td-crd">${e.crd ? fEN(e.crd) : ''}</td>
      <td class="${bCls(b)}">${fEN(b)}</td></tr>`;
  }).join('');
}

// ══════════════════════════════
// آخر الحركات (الداشبورد)
// ══════════════════════════════
function renderDashRecentTable() {
  const { entries } = get();
  const { allBalances, fEN, fD, bCls, TL, setEl } = h();
  const tb = g('d-recent');
  if (!tb) return;
  const recent = [...entries].slice(0, 6);
  setEl('d-recent-count', `آخر ${Math.min(6, recent.length)} حركة`);
  if (!recent.length) { emptyTable('d-recent', 6); return; }
  const bals = allBalances();
  tb.innerHTML = recent.map(e => {
    const b   = bals[e.id];
    const bCl = e.type === 'meter' ? 'badge-meter' : e.type === 'expense' ? 'badge-exp' : e.type === 'custody_r' ? 'badge-in' : 'badge-out';
    return `<tr>
      <td>${fD(e.date)}</td>
      <td><span class="badge ${bCl}">${TL[e.type]||e.type}</span></td>
      <td style="text-align:right;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(e.desc)}</td>
      <td style="color:var(--b500);font-size:.72rem;font-weight:700">${_esc(e.createdByName) || '—'}</td>
      <td class="td-crd">${e.crd ? fEN(e.crd) : ''}</td>
      <td class="${bCls(b)}">${fEN(b)}</td></tr>`;
  }).join('');
}

// ══════════════════════════════
// نشاط المستخدمين (للمدير)
// ══════════════════════════════
async function renderActivityLog() {
  const { currentRole } = get();
  const { fEN, fENn }   = h();
  const card = g('r-activity')?.closest('.card');
  const el   = g('r-activity');
  if (!el) return;
  if (currentRole !== 'admin' && currentRole !== 'manager') { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';

  el.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text3);font-size:.8rem">جاري التحميل...</div>';
  try {
    const snap     = await getDocs(collection(db, COLL.ENTRIES));
    const allEntries = [];
    snap.forEach(d => allEntries.push({ id: d.id, ...d.data() }));
    const map = {};
    allEntries.forEach(e => {
      const k = e.createdByName || e.createdBy || 'غير معروف';
      if (!map[k]) map[k] = { name: k, email: e.createdBy||'', count: 0, deb: 0, crd: 0, meters: 0, meterCount: 0 };
      map[k].count++;
      map[k].deb    += (e.deb||0);
      map[k].crd    += (e.crd||0);
      map[k].meters += (e.met||0);
      if (e.type === 'meter') map[k].meterCount++;
    });
    const rows = Object.values(map).sort((a,b) => b.count - a.count);
    if (!rows.length) { el.innerHTML = '<p style="color:var(--text3);text-align:center;padding:14px">لا توجد بيانات</p>'; return; }
    el.innerHTML = `<div class="scroll-x"><table style="min-width:460px">
      <thead><tr><th>المستخدم</th><th>الحركات</th><th>📏 السندات</th><th>الوارد</th><th>الصادر</th><th>الأمتار</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr style="cursor:pointer" onclick="openUserReport('${_esc(r.email||r.name)}','${_esc(r.name)}')">
        <td style="font-weight:700;color:var(--b600)">${_esc(r.name)}</td>
        <td>${fENn(r.count)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:3px;background:var(--b100);color:var(--b600);border:1px solid var(--b200);border-radius:20px;padding:2px 9px;font-size:.72rem;font-weight:800">${fENn(r.meterCount)}</span></td>
        <td class="td-deb">${r.deb ? fEN(r.deb) : ''}</td>
        <td class="td-crd">${r.crd ? fEN(r.crd) : ''}</td>
        <td style="color:var(--b600);font-weight:700">${r.meters ? r.meters+'م' : ''}</td>
        <td style="color:var(--b400);font-size:.75rem;white-space:nowrap">📊 عرض</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p style="font-size:.7rem;color:var(--text3);padding:8px 4px 0">اضغط على أي مستخدم لعرض تقريره الكامل</p>`;
  } catch(e) {
    el.innerHTML = '<p style="color:var(--text3);text-align:center;padding:14px">خطأ في التحميل</p>';
  }
}

// ══════════════════════════════
// الرسوم البيانية SVG/CSS
// ══════════════════════════════
function renderCharts() {
  const { entries, meterPrice, invoicePrice } = get();
  const { fEN } = h();
  const chartEl = g('r-charts');
  if (!chartEl) return;

  let totD=0, totC=0, totRev=0, totExp=0;
  entries.forEach(e => {
    totD += (e.deb||0); totC += (e.crd||0);
    if (e.type === 'meter')   totRev += (e.met||0) * invoicePrice;
    if (e.type === 'expense') totExp += (e.crd||0);
  });
  const netProfit = totRev - totC;
  const maxVal    = Math.max(totD, totC, totRev, 1);
  const bH        = 70;

  const bar = (val, color, label) => {
    const h2 = Math.max(4, Math.round(Math.abs(val) / maxVal * bH));
    const v   = val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="font-size:.66rem;font-weight:800;color:${color}">${v}</div>
      <div style="width:100%;background:var(--line);border-radius:4px;height:${bH}px;display:flex;align-items:flex-end;overflow:hidden">
        <div style="width:100%;height:${h2}px;background:${color};border-radius:4px 4px 0 0"></div>
      </div>
      <div style="font-size:.6rem;font-weight:700;color:var(--text2);text-align:center">${label}</div>
    </div>`;
  };

  const expMap = {};
  entries.filter(e => e.type === 'expense').forEach(e => { const k = e.etLabel||e.et||'أخرى'; expMap[k]=(expMap[k]||0)+(e.crd||0); });
  const expTotal = Object.values(expMap).reduce((s,v)=>s+v, 0);
  const colors   = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899'];
  const expBars  = Object.entries(expMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v],i) => {
    const pct = expTotal ? Math.round(v/expTotal*100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="width:8px;height:8px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0"></div>
      <div style="font-size:.7rem;flex:1;color:var(--text2)">${_esc(k)}</div>
      <div style="width:80px;background:var(--line);border-radius:3px;height:7px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${colors[i%colors.length]};border-radius:3px"></div>
      </div>
      <div style="font-size:.66rem;color:var(--text3);min-width:32px;text-align:left">${pct}%</div>
    </div>`;
  }).join('');

  chartEl.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:14px">
        <div style="font-size:.76rem;font-weight:800;color:var(--text);margin-bottom:10px">📊 المقارنة المالية</div>
        <div style="display:flex;gap:8px;align-items:flex-end;height:${bH+36}px">
          ${bar(totD,   '#15803d', 'الوارد')}
          ${bar(totC,   '#b91c1c', 'الصادر')}
          ${bar(totRev, '#1d4ed8', 'الإيراد')}
          ${bar(Math.max(0,netProfit), netProfit>=0?'#059669':'#dc2626', 'الربح')}
        </div>
      </div>
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:14px">
        <div style="font-size:.76rem;font-weight:800;color:var(--text);margin-bottom:10px">💸 توزيع المصروفات</div>
        ${expBars || '<div style="color:var(--text3);font-size:.76rem;text-align:center;padding:20px">لا توجد مصروفات</div>'}
      </div>
    </div>`;
}

// ══════════════════════════════
// تقرير مستخدم مفرد
// ══════════════════════════════
export async function openUserReport(userEmail, userName) {
  const { currentRole } = get();
  const { fEN, fD, bCls, EL, TL } = h();
  const mo      = g('user-report-mo');
  const bodyEl  = g('ur-body');
  if (!mo || !bodyEl) return;

  document.getElementById('ur-title').textContent = `📊 تقرير ${_esc(userName)}`;
  bodyEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3)">جاري التحميل...</div>';
  mo.classList.add('open');
  mo._email = userEmail;
  mo._name  = userName;

  const urFrom = g('ur-from'); if (urFrom) urFrom.value = '';
  const urTo   = g('ur-to');   if (urTo)   urTo.value   = '';

  try {
    const snap  = await getDocs(collection(db, COLL.ENTRIES));
    const allU  = [];
    snap.forEach(d => { const x = { id:d.id, ...d.data() }; if (x.createdBy === userEmail) allU.push(x); });
    allU.sort((a,b) => {
      const d = (b.date||'').localeCompare(a.date||'');
      return d !== 0 ? d : (b.createdAt||'').localeCompare(a.createdAt||'');
    });
    mo._allEntries = allU;
    renderUserReportTable();
  } catch(err) {
    bodyEl.innerHTML = '<p style="text-align:center;color:var(--red);padding:24px">خطأ في تحميل البيانات</p>';
  }
}

export function renderUserReportTable() {
  const { currentRole } = get();
  const { fEN, fD, bCls, EL, TL } = h();
  const mo     = g('user-report-mo');
  const bodyEl = g('ur-body');
  if (!mo || !mo._allEntries || !bodyEl) return;

  const from     = g('ur-from')?.value || '';
  const to       = g('ur-to')?.value   || '';
  const filtered = mo._allEntries.filter(e => {
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    return true;
  });
  mo._entries = filtered;

  if (!filtered.length) {
    bodyEl.innerHTML = '<p style="text-align:center;color:var(--text3);padding:24px">لا توجد حركات في هذه الفترة</p>';
    return;
  }

  const asc = [...filtered].reverse();
  let bal = 0; const balsMap = {};
  asc.forEach(e => { bal += (e.deb||0) - (e.crd||0); balsMap[e.id] = bal; });
  const totD = filtered.reduce((s,e)=>s+(e.deb||0),0);
  const totC = filtered.reduce((s,e)=>s+(e.crd||0),0);
  const totM = filtered.reduce((s,e)=>s+(e.met||0),0);

  const rows = filtered.map((e,i) => {
    const b     = balsMap[e.id] || 0;
    const label = e.type === 'expense' ? (e.etLabel||EL[e.et]||'أخرى') : (TL[e.type]||e.type);
    const plate = e.type === 'meter' && e.notes ? (e.notes.split('|')[0].replace('لوحة:','').trim()||'—') : '—';
    const actB  = currentRole === 'admin'
      ? `<td class="td-act"><button class="eb" onclick="closeMo('user-report-mo');openEdit('${e.id}')" title="تعديل">✏️</button><button onclick="closeMo('user-report-mo');confirmDel('${e.id}')" title="حذف">🗑</button></td>`
      : '<td></td>';
    return `<tr>
      <td>${filtered.length - i}</td>
      <td>${fD(e.date)}</td>
      <td><strong>${_esc(e.ref)||'—'}</strong></td>
      <td>${_esc(plate)}</td>
      <td><span class="badge badge-${e.type==='meter'?'meter':e.type==='expense'?'exp':e.type==='custody_r'?'in':'out'}" style="font-size:.65rem">${_esc(label)}</span></td>
      <td style="text-align:right;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(e.desc)||'—'}</td>
      <td style="color:var(--b600);font-weight:700">${e.met?e.met+'م':'—'}</td>
      <td class="td-deb">${e.deb?fEN(e.deb):''}</td>
      <td class="td-crd">${e.crd?fEN(e.crd):''}</td>
      <td class="${b>=0?'td-bp':'td-bn'}">${fEN(b)}</td>
      ${actB}</tr>`;
  }).join('');

  bodyEl.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--b100);border:1px solid var(--b200);border-radius:var(--r2);padding:10px;text-align:center">
        <div style="font-size:.7rem;color:var(--text3)">الرصيد في الفترة</div>
        <div style="font-size:1.1rem;font-weight:900;color:${bal>=0?'var(--green)':'var(--red)'}">${fEN(bal)} ر.س</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:var(--r2);padding:10px;text-align:center">
        <div style="font-size:.7rem;color:var(--text3)">إجمالي الأمتار</div>
        <div style="font-size:1.1rem;font-weight:900;color:var(--b600)">${totM}م</div>
      </div>
      <div style="background:var(--green2);border:1px solid #86efac;border-radius:var(--r2);padding:10px;text-align:center">
        <div style="font-size:.7rem;color:var(--green)">إجمالي الوارد</div>
        <div style="font-size:1rem;font-weight:800;color:var(--green)">${fEN(totD)}</div>
      </div>
      <div style="background:var(--red2);border:1px solid #fca5a5;border-radius:var(--r2);padding:10px;text-align:center">
        <div style="font-size:.7rem;color:var(--red)">إجمالي الصادر</div>
        <div style="font-size:1rem;font-weight:800;color:var(--red)">${fEN(totC)}</div>
      </div>
    </div>
    <div class="scroll-x"><table style="min-width:640px;font-size:.8rem">
      <thead><tr><th>#</th><th>التاريخ</th><th>السند</th><th>اللوحة</th><th>النوع</th><th>البيان</th><th>أمتار</th><th>وارد</th><th>صادر</th><th>الرصيد</th><th>⚙</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/** تشغيل المطابقة */
export function runReconcile(recRows, meterEntries, invoicePrice) {
  const { fEN, fD } = h();
  const recBody   = g('rec-result-tbody');
  const summaryEl = g('rec-summary');
  if (!recBody || !summaryEl) return;

  let matched=0, mismatch=0, notFound=0;
  let totalContractorCert=0, totalOurCert=0;

  const rows = recRows.map((r,i) => {
    totalContractorCert += (r.certM||0);
    let found = null;
    if (r.tripSheet) found = meterEntries.find(e => (e.tripSheet||'') === (r.tripSheet||'') && e.date === r.date);
    if (!found && r.truck) found = meterEntries.find(e => {
      const pl = e.plate || (e.notes||'').split('|')[0].replace('لوحة:','').trim();
      return pl && r.truck && (pl.includes(r.truck) || r.truck.includes(pl)) && e.date === r.date;
    });
    const ourCert = found ? (found.met||0) : null;
    if (found) totalOurCert += ourCert;
    let statusClass='', statusLabel='';
    if (!found)                      { notFound++; statusClass='rec-not-found'; statusLabel='⚠ غير موجود'; }
    else if (+ourCert === +r.certM)  { matched++;  statusClass='rec-match';     statusLabel='✅ مطابق'; }
    else                             { mismatch++; statusClass='rec-mismatch';  statusLabel='❌ فرق'; }
    const diff = found ? +(ourCert - r.certM).toFixed(2) : null;
    return `<tr class="${statusClass}">
      <td>${r.slNo||i+1}</td><td>${fD(r.date)}</td><td>${_esc(r.truck)||'—'}</td><td>${_esc(r.tripSheet)||'—'}</td>
      <td>${r.certM||0}م</td><td>${found ? ourCert+'م' : '—'}</td>
      <td style="font-weight:800">${diff!==null?(diff===0?'—':(diff>0?'+':'')+diff+'م'):'—'}</td>
      <td><span class="rec-status-badge ${statusClass}">${statusLabel}</span></td></tr>`;
  }).join('');

  recBody.innerHTML = rows;
  const invoiceAmt = +(totalContractorCert * invoicePrice).toFixed(2);
  summaryEl.innerHTML = `<div class="rec-sum-grid">
    <div class="rec-sum-card match">   <div class="rsc-l">✅ مطابق</div>  <div class="rsc-v">${matched}</div></div>
    <div class="rec-sum-card mismatch"><div class="rsc-l">❌ فرق</div>    <div class="rsc-v">${mismatch}</div></div>
    <div class="rec-sum-card notfound"><div class="rsc-l">⚠ غير موجود</div><div class="rsc-v">${notFound}</div></div>
    <div class="rec-sum-card total">   <div class="rsc-l">أمتار الكشف</div><div class="rsc-v">${totalContractorCert}م</div></div>
    <div class="rec-sum-card total">   <div class="rsc-l">أمتارنا</div>   <div class="rsc-v">${totalOurCert}م</div></div>
    <div class="rec-sum-card invoice"> <div class="rsc-l">قيمة الفاتورة (${totalContractorCert}م × ${invoicePrice})</div><div class="rsc-v">${fEN(invoiceAmt)} ر.س</div></div>
  </div>`;
  g('rec-results-section').style.display = 'block';
}

/** تنظيف النص لمنع XSS */
function _esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
