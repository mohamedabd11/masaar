// ══════════════════════════════════════════════════════════
// exports.js — دوال التصدير: PDF, Excel, JSON
// ══════════════════════════════════════════════════════════

import { db, COLL, collection, addDoc, getDocs, doc, getDoc } from './firebase.js';

// ── Context يُحدَّث من app.js ──
let _ctx = null;
export function initExports(ctx) { _ctx = ctx; }

// ── دوال مساعدة ──
const g    = id => document.getElementById(id);
const get  = ()  => _ctx.getState();
const h    = ()  => _ctx.helpers;

/** الحصول على الإدخالات المفلترة حسب التاريخ */
function getFilteredEntries() {
  const { entries } = get();
  const from = g('exp-from')?.value || '';
  const to   = g('exp-to')?.value   || '';
  if (!from && !to) return entries;
  return entries.filter(e => {
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    return true;
  });
}

// ══════════════════════════════
// تحديث معلومات فلتر التقارير
// ══════════════════════════════
export function updateReportFilter() {
  const { entries } = get();
  const { fD } = h();
  const from = g('exp-from')?.value || '';
  const to   = g('exp-to')?.value   || '';
  const info = g('exp-filter-info');
  const filtered = getFilteredEntries();
  if (!info) return;
  if (!from && !to) {
    info.textContent = `كل البيانات — ${entries.length} حركة`;
  } else {
    const fmtAr = d => new Date(d+'T00:00:00').toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'});
    info.textContent = `${from?fmtAr(from):'البداية'} ← ${to?fmtAr(to):'اليوم'} — ${filtered.length} حركة`;
  }
}

/** تعيين نطاق تاريخ سريع */
export function setExpDate(preset) {
  const today = new Date();
  const fmt   = d => d.toISOString().split('T')[0];
  const fromEl = g('exp-from');
  const toEl   = g('exp-to');
  if (!fromEl || !toEl) return;
  if      (preset === 'today')     { fromEl.value = fmt(today); toEl.value = fmt(today); }
  else if (preset === 'yesterday') { const y=new Date(today); y.setDate(y.getDate()-1); fromEl.value=fmt(y); toEl.value=fmt(y); }
  else if (preset === 'week')      { const m=new Date(today); m.setDate(today.getDate()-today.getDay()+1); fromEl.value=fmt(m); toEl.value=fmt(today); }
  else if (preset === 'month')     { fromEl.value=fmt(new Date(today.getFullYear(),today.getMonth(),1)); toEl.value=fmt(today); }
  else                             { fromEl.value=''; toEl.value=''; }
  updateReportFilter();
}

// ══════════════════════════════
// Excel شامل (كل الحركات)
// ══════════════════════════════
export function exportExcel() {
  const { EL, TL } = h();
  const entries        = getFilteredEntries();
  const exportEntries  = [...entries].reverse();
  if (!exportEntries.length) { _toast('⚠ لا توجد بيانات في النطاق المحدد','err'); return; }

  const { allBalances, fEN } = h();
  const bals = allBalances();
  let totD=0, totC=0, totM=0;
  exportEntries.forEach(e => { totD+=(e.deb||0); totC+=(e.crd||0); totM+=(e.met||0); });
  const bal = totD - totC;

  const ws   = XLSX.utils.aoa_to_sheet([]); ws['!rightToLeft'] = true;
  const cen  = { horizontal:'center', vertical:'center', readingOrder:2 };
  const rit  = { horizontal:'right',  vertical:'center', readingOrder:2 };
  const S    = _xlsxStyles(cen, rit);

  XLSX.utils.sheet_add_aoa(ws,[['مسار — سجل الحركات الكاملة','','','','','','','','','','','']],{origin:'A1'});
  XLSX.utils.sheet_add_aoa(ws,[['#','التاريخ','السند','النوع','البيان','اللوحة','أمتار','وارد','صادر','الرصيد','بواسطة','ملاحظات']],{origin:'A2'});
  ws['A1'].s = S.title;
  'ABCDEFGHIJKL'.split('').forEach(c => { if(ws[c+'1'])ws[c+'1'].s=S.title; if(ws[c+'2'])ws[c+'2'].s=S.hdr; });

  exportEntries.forEach((e,i) => {
    const r    = i+3; const b = bals[e.id]||0; const alt = i%2 !== 0;
    const cs   = alt ? S.rowA : S.rowW; const csr = alt ? S.rowAR : S.rowWR;
    const eLabel = e.type==='expense' ? (e.etLabel||EL[e.et]||'أخرى') : (TL[e.type]||e.type);
    const plate  = e.type==='meter'&&e.notes ? (e.notes.split('|')[0].replace('لوحة:','').trim()||'') : '';
    XLSX.utils.sheet_add_aoa(ws,[[i+1,e.date||'',e.ref||'',eLabel,e.desc||'',plate,(e.met||0)||'',e.deb||0,e.crd||0,b,e.createdByName||'',e.notes||'']],{origin:`A${r}`});
    ws[`A${r}`].s=cs; ws[`B${r}`].s=cs; ws[`C${r}`].s={...cs,font:{...cs.font,bold:true}};
    ws[`D${r}`].s=cs; ws[`E${r}`].s=csr; ws[`F${r}`].s=cs;
    ws[`G${r}`].s={...cs,font:{...cs.font,color:{rgb:'FF1D4ED8'}}};
    ws[`H${r}`].s=e.deb?S.deb:cs; ws[`H${r}`].z='#,##0.00';
    ws[`I${r}`].s=e.crd?S.crd:cs; ws[`I${r}`].z='#,##0.00';
    ws[`J${r}`].s=b>=0?S.balP:S.balN; ws[`J${r}`].z='#,##0.00';
    ws[`K${r}`].s={...cs,font:{...cs.font,color:{rgb:'FF1D4ED8'}}}; ws[`L${r}`].s=csr;
  });

  const totR = exportEntries.length+3;
  XLSX.utils.sheet_add_aoa(ws,[['الإجمالي','','','','','',totM,totD,totC,bal,'','']],{origin:`A${totR}`});
  ['A','B','C','D','E','F'].forEach(c => { if(ws[c+totR])ws[c+totR].s=S.tot; });
  ws[`G${totR}`].s=S.tot; ws[`H${totR}`].s=S.tot; ws[`H${totR}`].z='#,##0.00';
  ws[`I${totR}`].s=S.tot; ws[`I${totR}`].z='#,##0.00'; ws[`J${totR}`].s=S.tot; ws[`J${totR}`].z='#,##0.00';
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:totR-1,c:0},e:{r:totR-1,c:5}}];
  ws['!cols']   = [{wch:5},{wch:12},{wch:12},{wch:16},{wch:30},{wch:12},{wch:9},{wch:13},{wch:13},{wch:13},{wch:14},{wch:20}];
  ws['!freeze'] = {xSplit:0,ySplit:2,topLeftCell:'A3',activePane:'bottomLeft',state:'frozen'};

  const wb = _newWorkbook();
  XLSX.utils.book_append_sheet(wb, ws, 'سجل العمليات');
  XLSX.writeFile(wb, `العمليات_${_today()}.xlsx`);
  _toast('✅ تم تصدير Excel','ok');
}

// ══════════════════════════════
// PDF شامل
// ══════════════════════════════
export function exportPDF() {
  const { EL, TL } = h();
  const entries       = getFilteredEntries();
  const exportEntries = [...entries].reverse();
  if (!exportEntries.length) { _toast('⚠ لا توجد بيانات في النطاق المحدد','err'); return; }

  const { allBalances, fEN, fD } = h();
  const bals = allBalances(); let totD=0, totC=0, totM=0;
  exportEntries.forEach(e => { totD+=(e.deb||0); totC+=(e.crd||0); totM+=(e.met||0); });
  const bal = totD - totC;
  const from = g('exp-from')?.value||''; const to = g('exp-to')?.value||'';
  const dateRangeLabel = from||to ? `الفترة: ${from||'البداية'} — ${to||'اليوم'}` : 'كل البيانات';

  const rows = exportEntries.map((e,i) => {
    const plate = e.type==='meter'&&e.notes ? (e.notes.split('|')[0].replace('لوحة:','').trim()||'—') : '—';
    const b     = bals[e.id]||0;
    return `<tr><td>${i+1}</td><td>${fD(e.date)}</td><td>${e.ref||'—'}</td><td>${plate}</td>
      <td>${e.type==='expense'?(e.etLabel||EL[e.et]||'أخرى'):(TL[e.type]||e.type)}</td>
      <td style="text-align:right">${e.desc||''}</td>
      <td style="color:#1d4ed8;font-weight:700">${e.met?e.met+'م':'—'}</td>
      <td style="color:#15803d;font-weight:700">${e.deb?fEN(e.deb):''}</td>
      <td style="color:#b91c1c;font-weight:700">${e.crd?fEN(e.crd):''}</td>
      <td style="font-weight:800;color:${b>=0?'#15803d':'#b91c1c'}">${fEN(b)}</td>
      <td style="color:#1d4ed8;font-size:8px">${e.createdByName||'—'}</td></tr>`;
  }).join('');

  const cntM = entries.filter(e=>e.type==='meter').length;
  const cntC = entries.filter(e=>e.type==='custody_r'||e.type==='custody_d').length;
  const cntE = entries.filter(e=>e.type==='expense').length;
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
    <style>body{font-family:'Tajawal',sans-serif;direction:rtl;padding:16px;color:#0f172a;font-size:9px}
    h2{text-align:center;background:#0a1628;color:#fff;padding:12px;border-radius:8px;margin-bottom:8px;font-size:14px}
    .meta{text-align:center;color:#64748b;margin-bottom:8px;font-size:8px}
    .sum{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px}
    .cnt{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
    .sc{background:#f0f5ff;border:1px solid #dde8ff;border-radius:6px;padding:7px;text-align:center}
    .sc .sv{font-size:13px;font-weight:900}.sc .sl{font-size:8px;color:#64748b;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;font-size:8px}
    th{background:#0f2040;color:#fff;padding:5px;text-align:center}
    td{padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:center}
    tr:nth-child(even){background:#f0f5ff}
    @media print{@page{size:A4 landscape;margin:10mm}}</style>
    </head><body>
    <h2>🧭 مسار — التقرير الشامل</h2>
    <div class="meta">${new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} | ${dateRangeLabel} | ${entries.length} حركة</div>
    <div class="sum">
      <div class="sc"><div class="sl">الرصيد</div><div class="sv" style="color:${bal>=0?'#15803d':'#b91c1c'}">${fEN(bal)}</div></div>
      <div class="sc"><div class="sl">الوارد</div><div class="sv" style="color:#15803d">${fEN(totD)}</div></div>
      <div class="sc"><div class="sl">الصادر</div><div class="sv" style="color:#b91c1c">${fEN(totC)}</div></div>
      <div class="sc"><div class="sl">الأمتار</div><div class="sv" style="color:#1d4ed8">${totM}م</div></div>
    </div>
    <div class="cnt">
      <div class="sc"><div class="sl">📏 سندات الأمتار</div><div class="sv" style="color:#1d4ed8">${cntM}</div></div>
      <div class="sc"><div class="sl">🗂 حركات العهدة</div><div class="sv" style="color:#15803d">${cntC}</div></div>
      <div class="sc"><div class="sl">💸 فواتير المصروفات</div><div class="sv" style="color:#b91c1c">${cntE}</div></div>
    </div>
    <table><thead><tr><th>#</th><th>التاريخ</th><th>السند</th><th>اللوحة</th><th>النوع</th><th>البيان</th><th>أمتار</th><th>وارد</th><th>صادر</th><th>الرصيد</th><th>بواسطة</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print();<\/script></body></html>`;
  _openPrint(html);
  _toast('🖨 جاري الطباعة...','ok');
}

// ══════════════════════════════
// PDF مختصر (داشبورد + رسوم بيانية)
// ══════════════════════════════
export function exportShortPDF() {
  const entries = getFilteredEntries();
  if (!entries.length) { _toast('⚠ لا توجد بيانات في النطاق المحدد','err'); return; }

  const { EL } = h();
  let totD=0, totC=0, totM=0;
  entries.forEach(e => { totD+=(e.deb||0); totC+=(e.crd||0); totM+=(e.met||0); });
  const bal  = totD - totC;
  const cntM = entries.filter(e=>e.type==='meter').length;
  const cntC = entries.filter(e=>e.type==='custody_r'||e.type==='custody_d').length;
  const cntE = entries.filter(e=>e.type==='expense').length;
  const from = g('exp-from')?.value||''; const to = g('exp-to')?.value||'';
  const dateRangeLabel = from||to ? `الفترة: ${from||'البداية'} — ${to||'اليوم'}` : 'كل البيانات';
  const dateStr = new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const expMap = {}; entries.filter(e=>e.type==='expense').forEach(e=>{const k=e.etLabel||e.et||'أخرى';expMap[k]=(expMap[k]||0)+(e.crd||0);});
  const expTotal = Object.values(expMap).reduce((s,v)=>s+v,0);
  const expBars  = Object.entries(expMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>{
    const pct = expTotal ? Math.round(v/expTotal*100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="width:80px;font-size:8px;text-align:right;flex-shrink:0">${k}</div><div style="flex:1;background:#e2e8f0;border-radius:3px;height:10px"><div style="background:#1d4ed8;width:${pct}%;height:100%;border-radius:3px"></div></div><div style="font-size:8px;width:45px;text-align:left">${v.toFixed(0)} ر.س</div></div>`;
  }).join('');

  const maxV = Math.max(totD, totC, 1);
  const bW   = v => Math.round(Math.abs(v)/maxV*100);
  const netProfit = totD - totC;

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
    <style>body{font-family:'Tajawal',sans-serif;direction:rtl;padding:16px;color:#0f172a;font-size:10px}
    h2{text-align:center;background:#0a1628;color:#fff;padding:12px;border-radius:8px;margin-bottom:6px;font-size:14px}
    .meta{text-align:center;color:#64748b;font-size:9px;margin-bottom:12px}
    .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}
    .card{background:#f0f5ff;border:1px solid #dde8ff;border-radius:6px;padding:8px;text-align:center}
    .card .v{font-size:14px;font-weight:900}.card .l{font-size:8px;color:#64748b;margin-bottom:3px}
    .chart-box{background:#f8faff;border:1px solid #dde8ff;border-radius:6px;padding:10px;margin-bottom:10px}
    .chart-title{font-size:9px;font-weight:700;color:#1e3a8a;margin-bottom:8px}
    .bar-chart{display:flex;align-items:flex-end;gap:12px;height:60px;margin-bottom:4px}
    .bar-item{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
    .bar{border-radius:3px 3px 0 0;width:100%}.bar-lbl{font-size:7px;color:#64748b}.bar-val{font-size:7px;font-weight:700}
    @media print{@page{size:A4;margin:10mm}}</style></head><body>
    <h2>🏦 مسار — التقرير المختصر</h2>
    <div class="meta">${dateStr} | ${dateRangeLabel}</div>
    <div class="grid4">
      <div class="card"><div class="l">الرصيد المتاح</div><div class="v" style="color:${bal>=0?'#15803d':'#b91c1c'}">${bal.toFixed(2)}</div></div>
      <div class="card"><div class="l">إجمالي الوارد</div><div class="v" style="color:#15803d">${totD.toFixed(2)}</div></div>
      <div class="card"><div class="l">إجمالي الصادر</div><div class="v" style="color:#b91c1c">${totC.toFixed(2)}</div></div>
      <div class="card"><div class="l">إجمالي الأمتار</div><div class="v" style="color:#1d4ed8">${totM}م</div></div>
    </div>
    <div class="grid3">
      <div class="card"><div class="l">📏 سندات الأمتار</div><div class="v">${cntM}</div></div>
      <div class="card"><div class="l">🗂 حركات العهدة</div><div class="v">${cntC}</div></div>
      <div class="card"><div class="l">💸 فواتير المصروفات</div><div class="v">${cntE}</div></div>
    </div>
    <div class="chart-box">
      <div class="chart-title">📊 مقارنة الوارد والصادر</div>
      <div class="bar-chart">
        <div class="bar-item"><div class="bar-val" style="color:#15803d">${totD.toFixed(0)}</div><div class="bar" style="height:${bW(totD)}%;background:#15803d;min-height:4px"></div><div class="bar-lbl">الوارد</div></div>
        <div class="bar-item"><div class="bar-val" style="color:#b91c1c">${totC.toFixed(0)}</div><div class="bar" style="height:${bW(totC)}%;background:#b91c1c;min-height:4px"></div><div class="bar-lbl">الصادر</div></div>
        <div class="bar-item"><div class="bar-val" style="color:${netProfit>=0?'#15803d':'#b91c1c'}">${netProfit.toFixed(0)}</div><div class="bar" style="height:${bW(netProfit)}%;background:${netProfit>=0?'#22c55e':'#ef4444'};min-height:4px"></div><div class="bar-lbl">الرصيد</div></div>
      </div>
    </div>
    ${expBars ? `<div class="chart-box"><div class="chart-title">💸 توزيع المصروفات</div>${expBars}</div>` : ''}
    <script>window.onload=()=>window.print();<\/script></body></html>`;
  _openPrint(html);
  _toast('🖨 جاري طباعة التقرير المختصر...','ok');
}

// ══════════════════════════════
// Excel مختصر (شيت واحد)
// ══════════════════════════════
export function exportShortExcel() {
  const entries = getFilteredEntries();
  if (!entries.length) { _toast('⚠ لا توجد بيانات في النطاق المحدد','err'); return; }

  const { allBalances } = h();
  const bals = allBalances(); let totD=0, totC=0, totM=0;
  entries.forEach(e => { totD+=(e.deb||0); totC+=(e.crd||0); totM+=(e.met||0); });
  const bal = totD - totC;
  const cen = {horizontal:'center',vertical:'center',readingOrder:2};
  const S   = _xlsxStyles(cen, cen);
  const wsSum = XLSX.utils.aoa_to_sheet([]); wsSum['!rightToLeft'] = true;
  const cntM = entries.filter(e=>e.type==='meter').length;
  const cntC = entries.filter(e=>e.type==='custody_r'||e.type==='custody_d').length;
  const cntE = entries.filter(e=>e.type==='expense').length;
  const sumData = [
    ['مسار — التقرير المختصر',''],
    ['تاريخ التقرير', new Date().toLocaleDateString('ar-SA')],['',''],
    ['البيان','القيمة'],
    ['الرصيد المتاح', +bal.toFixed(2)],['إجمالي الوارد', +totD.toFixed(2)],
    ['إجمالي الصادر', +totC.toFixed(2)],['إجمالي الأمتار (م)', totM],
    ['عدد سندات الأمتار', cntM],['عدد حركات العهدة', cntC],
    ['عدد فواتير المصروفات', cntE],['إجمالي الحركات', entries.length]
  ];
  XLSX.utils.sheet_add_aoa(wsSum, sumData, {origin:'A1'});
  ['A1','B1'].forEach(k => { if(wsSum[k]) wsSum[k].s=S.title; });
  ['A4','B4'].forEach(k => { if(wsSum[k]) wsSum[k].s=S.hdr; });
  for (let r=5; r<=12; r++) {
    const alt = r%2===0;
    ['A','B'].forEach(c => { const k=c+r; if(wsSum[k]) wsSum[k].s=alt?S.rowA:S.rowW; });
  }
  wsSum['!merges'] = [{s:{r:0,c:0},e:{r:0,c:1}}];
  wsSum['!cols']   = [{wch:30},{wch:20}];
  const wb = _newWorkbook();
  XLSX.utils.book_append_sheet(wb, wsSum, 'التقرير المختصر');
  XLSX.writeFile(wb, `تقرير_مختصر_${_today()}.xlsx`);
  _toast('✅ تم تصدير التقرير المختصر','ok');
}

// ══════════════════════════════
// PDF تقرير مستخدم — احترافي
// ══════════════════════════════
export function exportUserReportPDF() {
  const { fEN, fD, EL, TL } = h();
  const mo      = g('user-report-mo');
  const entries = mo?._entries;
  const name    = mo?._name || 'مستخدم';
  if (!entries?.length) { _toast('⚠ لا توجد بيانات','err'); return; }

  const from = g('ur-from')?.value||'';
  const to   = g('ur-to')?.value||'';
  const dateRangeLabel = from||to ? `الفترة: ${from||'البداية'} — ${to||'اليوم'}` : 'كل البيانات المتاحة';
  const dateStr = new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // ── الأرقام ──
  const asc = [...entries].reverse(); let bal=0; const balsMap={};
  asc.forEach(e => { bal+=(e.deb||0)-(e.crd||0); balsMap[e.id]=bal; });
  const totD = entries.reduce((s,e)=>s+(e.deb||0),0);
  const totC = entries.reduce((s,e)=>s+(e.crd||0),0);
  const totM = entries.reduce((s,e)=>s+(e.met||0),0);
  const cntM = entries.filter(e=>e.type==='meter').length;
  const cntC = entries.filter(e=>e.type==='custody_r'||e.type==='custody_d').length;
  const cntE = entries.filter(e=>e.type==='expense').length;

  // ── رسم بياني للمصروفات ──
  const expMap = {};
  entries.filter(e=>e.type==='expense').forEach(e=>{
    const k = e.etLabel||EL[e.et]||'أخرى';
    expMap[k] = (expMap[k]||0)+(e.crd||0);
  });
  const expTotal = Object.values(expMap).reduce((s,v)=>s+v,0);
  const expBars  = Object.entries(expMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>{
    const pct = expTotal ? Math.round(v/expTotal*100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="width:75px;font-size:8px;text-align:right;flex-shrink:0">${k}</div>
      <div style="flex:1;background:#e2e8f0;border-radius:3px;height:9px">
        <div style="background:#1d4ed8;width:${pct}%;height:100%;border-radius:3px"></div>
      </div>
      <div style="font-size:8px;width:55px;text-align:left">${fEN(v)} (${pct}%)</div>
    </div>`;
  }).join('');

  // ── رسم بياني للمقارنة المالية ──
  const maxV  = Math.max(totD, totC, 1);
  const bW    = v => Math.max(4, Math.round(Math.abs(v)/maxV*100));

  // ── جدول الحركات ──
  const rows = asc.map((e,i)=>{
    const b     = balsMap[e.id]||0;
    const label = e.type==='expense'?(e.etLabel||EL[e.et]||'أخرى'):(TL[e.type]||e.type);
    const plate = e.type==='meter'&&e.notes?(e.notes.split('|')[0].replace('لوحة:','').trim()||'—'):'—';
    const bg    = i%2===0?'':'background:#f0f5ff;';
    return `<tr style="${bg}">
      <td>${i+1}</td><td>${fD(e.date)}</td><td><b>${e.ref||'—'}</b></td>
      <td>${plate}</td><td>${label}</td>
      <td style="text-align:right;max-width:120px">${e.desc||''}</td>
      <td style="color:#1d4ed8;font-weight:700">${e.met?e.met+'م':'—'}</td>
      <td style="color:#15803d;font-weight:700">${e.deb?fEN(e.deb):''}</td>
      <td style="color:#b91c1c;font-weight:700">${e.crd?fEN(e.crd):''}</td>
      <td style="font-weight:800;color:${b>=0?'#15803d':'#b91c1c'}">${fEN(b)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Tajawal',sans-serif;direction:rtl;padding:14px;color:#0f172a;font-size:9px}
    h2{text-align:center;background:linear-gradient(135deg,#0a1628,#1a3a6b);color:#fff;padding:13px;border-radius:8px;margin-bottom:5px;font-size:15px;letter-spacing:.02em}
    .sub{text-align:center;background:#1d4ed8;color:#fff;padding:5px;border-radius:4px;font-size:9px;margin-bottom:8px;font-weight:700}
    .meta{text-align:center;color:#64748b;font-size:8px;margin-bottom:10px}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px}
    .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
    .card{border-radius:6px;padding:8px;text-align:center;border:1px solid #dde8ff}
    .card .v{font-size:13px;font-weight:900}.card .l{font-size:7px;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em}
    .card-blue{background:linear-gradient(135deg,#1a3a6b,#1d4ed8);color:#fff;border:none}
    .card-blue .l{color:rgba(255,255,255,.6)}.card-blue .v{color:#fff}
    .card-green{background:#dcfce7;border-color:#86efac}
    .card-red{background:#fee2e2;border-color:#fca5a5}
    .card-default{background:#f0f5ff}
    .chart-box{background:#f8faff;border:1px solid #dde8ff;border-radius:6px;padding:10px;margin-bottom:8px}
    .chart-title{font-size:9px;font-weight:800;color:#0f2040;margin-bottom:7px;border-bottom:2px solid #dde8ff;padding-bottom:4px}
    .bar-wrap{display:flex;align-items:flex-end;gap:10px;height:65px;margin-bottom:5px}
    .bar-item{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
    .bar{border-radius:3px 3px 0 0;width:100%}
    .bar-lbl{font-size:7px;color:#64748b;white-space:nowrap}
    .bar-val{font-size:7px;font-weight:800}
    .divider{font-size:9px;font-weight:800;color:#fff;background:#0f2040;padding:5px 10px;border-radius:4px 4px 0 0;margin-bottom:0;display:block}
    table{width:100%;border-collapse:collapse;font-size:8px}
    th{background:#0f2040;color:rgba(255,255,255,.8);padding:6px 4px;text-align:center;font-size:7.5px;letter-spacing:.03em}
    td{padding:4px;border-bottom:1px solid #e8edf5;text-align:center}
    .totrow td{background:#0a1628;color:#fff;font-weight:900;font-size:9px}
    @media print{@page{size:A4;margin:8mm}body{padding:8px}}
  </style></head><body>

  <h2>📊 تقرير ${name}</h2>
  <div class="sub">👤 نشاط المستخدم — تفصيلي</div>
  <div class="meta">${dateStr} | ${dateRangeLabel} | ${entries.length} حركة</div>

  <!-- ملخص مالي -->
  <div class="g4">
    <div class="card card-blue">
      <div class="l">الرصيد الختامي</div>
      <div class="v">${fEN(bal)}</div>
    </div>
    <div class="card card-green">
      <div class="l">إجمالي الوارد</div>
      <div class="v" style="color:#15803d">${fEN(totD)}</div>
    </div>
    <div class="card card-red">
      <div class="l">إجمالي الصادر</div>
      <div class="v" style="color:#b91c1c">${fEN(totC)}</div>
    </div>
    <div class="card card-default">
      <div class="l">إجمالي الأمتار</div>
      <div class="v" style="color:#1d4ed8">${totM}م</div>
    </div>
  </div>

  <!-- عدد الحركات -->
  <div class="g3">
    <div class="card card-default">
      <div class="l">📏 سندات الأمتار</div>
      <div class="v" style="color:#1d4ed8">${cntM}</div>
    </div>
    <div class="card card-default">
      <div class="l">🗂 حركات العهدة</div>
      <div class="v" style="color:#15803d">${cntC}</div>
    </div>
    <div class="card card-default">
      <div class="l">💸 فواتير المصروفات</div>
      <div class="v" style="color:#b91c1c">${cntE}</div>
    </div>
  </div>

  <!-- رسوم بيانية -->
  <div class="g2">
    <div class="chart-box">
      <div class="chart-title">📊 المقارنة المالية</div>
      <div class="bar-wrap">
        <div class="bar-item">
          <div class="bar-val" style="color:#15803d">${totD>=1000?(totD/1000).toFixed(1)+'k':totD.toFixed(0)}</div>
          <div class="bar" style="height:${bW(totD)}%;background:#15803d;min-height:4px"></div>
          <div class="bar-lbl">الوارد</div>
        </div>
        <div class="bar-item">
          <div class="bar-val" style="color:#b91c1c">${totC>=1000?(totC/1000).toFixed(1)+'k':totC.toFixed(0)}</div>
          <div class="bar" style="height:${bW(totC)}%;background:#b91c1c;min-height:4px"></div>
          <div class="bar-lbl">الصادر</div>
        </div>
        <div class="bar-item">
          <div class="bar-val" style="color:${bal>=0?'#15803d':'#b91c1c'}">${Math.abs(bal)>=1000?(Math.abs(bal)/1000).toFixed(1)+'k':Math.abs(bal).toFixed(0)}</div>
          <div class="bar" style="height:${bW(bal)}%;background:${bal>=0?'#22c55e':'#ef4444'};min-height:4px"></div>
          <div class="bar-lbl">الرصيد</div>
        </div>
        <div class="bar-item">
          <div class="bar-val" style="color:#1d4ed8">${totM}م</div>
          <div class="bar" style="height:40%;background:#1d4ed8;min-height:4px"></div>
          <div class="bar-lbl">أمتار</div>
        </div>
      </div>
    </div>
    <div class="chart-box">
      <div class="chart-title">💸 توزيع المصروفات</div>
      ${expBars || '<div style="color:#94a3b8;font-size:8px;text-align:center;padding:15px">لا توجد مصروفات</div>'}
    </div>
  </div>

  <!-- جدول الحركات -->
  <span class="divider">📋 تفصيل الحركات (${entries.length} حركة)</span>
  <table>
    <thead><tr><th>#</th><th>التاريخ</th><th>السند</th><th>اللوحة</th><th>النوع</th><th>البيان</th><th>أمتار</th><th>وارد ر.س</th><th>صادر ر.س</th><th>الرصيد ر.س</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="totrow">
      <td colspan="6">الإجماليات</td>
      <td>${totM}م</td>
      <td>${fEN(totD)}</td>
      <td>${fEN(totC)}</td>
      <td style="color:${bal>=0?'#86efac':'#fca5a5'}">${fEN(bal)}</td>
    </tr></tfoot>
  </table>

  <script>window.onload=()=>window.print();<\/script></body></html>`;
  _openPrint(html);
  _toast('🖨 جاري طباعة تقرير ' + name + '...','ok');
}

// ══════════════════════════════
// Excel تقرير مستخدم — شيتان احترافيان
// ══════════════════════════════
export function exportUserReportExcel() {
  const { fEN, EL, TL } = h();
  const mo      = g('user-report-mo');
  const entries = mo?._entries;
  const name    = mo?._name || 'مستخدم';
  if (!entries?.length) { _toast('⚠ لا توجد بيانات','err'); return; }

  const from = g('ur-from')?.value||'';
  const to   = g('ur-to')?.value||'';
  const dateRangeLabel = from||to ? `${from||'البداية'} — ${to||'اليوم'}` : 'كل البيانات';

  const asc = [...entries].reverse(); let bal=0; const balsMap={};
  asc.forEach(e => { bal+=(e.deb||0)-(e.crd||0); balsMap[e.id]=bal; });
  const totD = entries.reduce((s,e)=>s+(e.deb||0),0);
  const totC = entries.reduce((s,e)=>s+(e.crd||0),0);
  const totM = entries.reduce((s,e)=>s+(e.met||0),0);
  const cntM = entries.filter(e=>e.type==='meter').length;
  const cntC = entries.filter(e=>e.type==='custody_r'||e.type==='custody_d').length;
  const cntE = entries.filter(e=>e.type==='expense').length;

  const cen = {horizontal:'center',vertical:'center',readingOrder:2};
  const rit = {horizontal:'right',  vertical:'center',readingOrder:2};
  const S   = _xlsxStyles(cen, rit);

  // ── الشيت الأول: الملخص ──
  const wsSum = XLSX.utils.aoa_to_sheet([]); wsSum['!rightToLeft'] = true;
  const sumData = [
    [`تقرير ${name}`, ''],
    ['الفترة', dateRangeLabel],
    ['تاريخ التقرير', new Date().toLocaleDateString('ar-SA')],
    ['', ''],
    ['البيان', 'القيمة'],
    ['الرصيد الختامي', +bal.toFixed(2)],
    ['إجمالي الوارد', +totD.toFixed(2)],
    ['إجمالي الصادر', +totC.toFixed(2)],
    ['إجمالي الأمتار (م)', totM],
    ['', ''],
    ['عدد الحركات الكلي', entries.length],
    ['📏 سندات الأمتار', cntM],
    ['🗂 حركات العهدة', cntC],
    ['💸 فواتير المصروفات', cntE],
  ];

  // توزيع المصروفات
  const expMap = {};
  entries.filter(e=>e.type==='expense').forEach(e=>{
    const k = e.etLabel||EL[e.et]||'أخرى';
    expMap[k] = (expMap[k]||0)+(e.crd||0);
  });
  const expEntries = Object.entries(expMap).sort((a,b)=>b[1]-a[1]);
  if (expEntries.length) {
    sumData.push(['', '']);
    sumData.push(['تفصيل المصروفات', 'المبلغ ر.س']);
    expEntries.forEach(([k,v]) => sumData.push([k, +v.toFixed(2)]));
  }

  XLSX.utils.sheet_add_aoa(wsSum, sumData, {origin:'A1'});

  // تنسيق
  ['A1','B1'].forEach(k => { if(wsSum[k]) wsSum[k].s = S.title; });
  const hdrs = [2, 3, 5, 11];
  hdrs.forEach(r => {
    ['A','B'].forEach(c => { const k=c+r; if(wsSum[k]) wsSum[k].s = {font:{bold:true,sz:10,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF1A3A6B'}},alignment:cen}; });
  });
  // تلوين خلية الرصيد
  if (wsSum['B6']) {
    wsSum['B6'].s = bal>=0
      ? {font:{bold:true,sz:12,color:{rgb:'FF15803D'}},fill:{fgColor:{rgb:'FFDCFCE7'}},alignment:cen}
      : {font:{bold:true,sz:12,color:{rgb:'FFB91C1C'}},fill:{fgColor:{rgb:'FFFEE2E2'}},alignment:cen};
    wsSum['B6'].z = '#,##0.00';
  }
  if (wsSum['B7']) { wsSum['B7'].s = S.deb; wsSum['B7'].z = '#,##0.00'; }
  if (wsSum['B8']) { wsSum['B8'].s = S.crd; wsSum['B8'].z = '#,##0.00'; }
  for (let r=6; r<=sumData.length; r++) {
    const alt = r%2===0;
    ['A','B'].forEach(c => { const k=c+r; if(wsSum[k] && !wsSum[k].s) wsSum[k].s = alt ? S.rowA : S.rowW; });
  }
  wsSum['!merges'] = [{s:{r:0,c:0},e:{r:0,c:1}}];
  wsSum['!cols']   = [{wch:32},{wch:22}];

  // ── الشيت الثاني: الحركات التفصيلية ──
  const ws = XLSX.utils.aoa_to_sheet([]); ws['!rightToLeft'] = true;
  const hdrRow = [`تفصيل حركات ${name}`.slice(0,40),'','','','','','','','','',''];
  XLSX.utils.sheet_add_aoa(ws,[hdrRow],{origin:'A1'});
  XLSX.utils.sheet_add_aoa(ws,[['#','التاريخ','السند','اللوحة','النوع','البيان','الوردية','أمتار','وارد','صادر','الرصيد']],{origin:'A2'});
  'ABCDEFGHIJK'.split('').forEach(c => {
    if(ws[c+'1'])ws[c+'1'].s=S.title;
    if(ws[c+'2'])ws[c+'2'].s=S.hdr;
  });

  asc.forEach((e,i) => {
    const r   = i+3;
    const b   = balsMap[e.id]||0;
    const alt = i%2!==0;
    const cs  = alt ? S.rowA : S.rowW;
    const label = e.type==='expense'?(e.etLabel||EL[e.et]||'أخرى'):(TL[e.type]||e.type);
    const plate = e.type==='meter'&&e.notes?(e.notes.split('|')[0].replace('لوحة:','').trim()||'—'):'—';
    const shift = e.shift==='night'?'مسائي':e.shift==='day'?'صباحي':'—';
    XLSX.utils.sheet_add_aoa(ws,[[i+1,e.date||'',e.ref||'',plate,label,e.desc||'',shift,e.met||0,e.deb||0,e.crd||0,b]],{origin:`A${r}`});
    'ABCDE'.split('').forEach(c => { if(ws[c+r]) ws[c+r].s=cs; });
    ws[`F${r}`].s={...cs,alignment:rit};
    ws[`G${r}`].s=cs;
    ws[`H${r}`].s={...cs,font:{...cs.font,color:{rgb:'FF1D4ED8'}}};
    ws[`I${r}`].s=e.deb?S.deb:cs; ws[`I${r}`].z='#,##0.00';
    ws[`J${r}`].s=e.crd?S.crd:cs; ws[`J${r}`].z='#,##0.00';
    ws[`K${r}`].s=b>=0?S.balP:S.balN; ws[`K${r}`].z='#,##0.00';
  });

  // صف الإجماليات
  const totR = asc.length+3;
  XLSX.utils.sheet_add_aoa(ws,[['الإجمالي','','','','','','',totM,+totD.toFixed(2),+totC.toFixed(2),+bal.toFixed(2)]],{origin:`A${totR}`});
  'ABCDEFG'.split('').forEach(c=>{ if(ws[c+totR]) ws[c+totR].s=S.tot; });
  ws[`H${totR}`].s=S.tot;
  ws[`I${totR}`].s=S.tot; ws[`I${totR}`].z='#,##0.00';
  ws[`J${totR}`].s=S.tot; ws[`J${totR}`].z='#,##0.00';
  ws[`K${totR}`].s=S.tot; ws[`K${totR}`].z='#,##0.00';

  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:10}},{s:{r:totR-1,c:0},e:{r:totR-1,c:6}}];
  ws['!cols']=[{wch:5},{wch:12},{wch:12},{wch:12},{wch:18},{wch:28},{wch:10},{wch:10},{wch:14},{wch:14},{wch:14}];
  ws['!freeze']={xSplit:0,ySplit:2,topLeftCell:'A3',activePane:'bottomLeft',state:'frozen'};

  const wb = _newWorkbook();
  XLSX.utils.book_append_sheet(wb, wsSum, 'الملخص');
  XLSX.utils.book_append_sheet(wb, ws,    'الحركات التفصيلية');
  XLSX.writeFile(wb, `تقرير_${name}_${_today()}.xlsx`);
  _toast(`✅ تم تصدير تقرير ${name}`, 'ok');
}

// ══════════════════════════════
// نسخ احتياطي JSON
// ══════════════════════════════
export async function exportJSON(currentUser, writeAuditLog) {
  try {
    const snap     = await getDocs(collection(db, COLL.ENTRIES));
    const data     = []; snap.forEach(d => data.push({ id:d.id, ...d.data() }));
    const settSnap = await getDoc(doc(db, COLL.SETTINGS, 'system'));
    const settings = settSnap.exists() ? settSnap.data() : {};
    const backup   = { exportedAt: new Date().toISOString(), exportedBy: currentUser?.email||'', version: '2.1', settings, entries: data };
    const blob     = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a'); a.href=url;
    a.download = `مسار_نسخ_احتياطي_${_today()}.json`;
    a.click(); URL.revokeObjectURL(url);
    await writeAuditLog('EXPORT_JSON', { count: data.length });
    _toast(`✅ تم تصدير ${data.length} سجل كـ JSON`, 'ok');
  } catch(e) { _toast('⚠ فشل التصدير','err'); }
}

export function importJSON(currentUser, writeAuditLog) {
  const input = document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    if (!confirm(`⚠ استيراد البيانات من "${file.name}"؟\nسيتم إضافة السجلات دون حذف الموجودة.`)) return;
    const btn = g('import-json-btn');
    if (btn) { btn.textContent='جاري الاستيراد...'; btn.disabled=true; }
    try {
      const text   = await file.text();
      const backup = JSON.parse(text);
      if (!backup.entries || !Array.isArray(backup.entries)) { _toast('⚠ ملف غير صالح','err'); return; }
      let count = 0;
      for (const e of backup.entries) {
        const { id, ...data } = e;
        await addDoc(collection(db, COLL.ENTRIES), { ...data, importedAt: new Date().toISOString(), importedBy: currentUser?.email||'' });
        count++;
      }
      await writeAuditLog('IMPORT_JSON', { count, file: file.name });
      _toast(`✅ تم استيراد ${count} سجل بنجاح`,'ok');
    } catch(e) { _toast('⚠ خطأ في الاستيراد — تحقق من صحة الملف','err'); }
    if (btn) { btn.textContent='📥 استيراد JSON'; btn.disabled=false; }
  };
  input.click();
}

// ══════════════════════════════
// استيراد من Excel
// ══════════════════════════════
export function importExcel(currentUser, writeAuditLog) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const btn = g('import-excel-btn');
    if (btn) { btn.textContent = 'جاري القراءة...'; btn.disabled = true; }
    try {
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array', cellDates: true });

      // ابحث عن الشيت المناسب
      const targets = ['سجل العمليات', 'الحركات التفصيلية', 'سجل الحركات', 'Sheet1'];
      let ws = null, sheetName = '';
      for (const sn of targets) {
        if (wb.SheetNames.includes(sn)) { ws = wb.Sheets[sn]; sheetName = sn; break; }
      }
      if (!ws) { sheetName = wb.SheetNames[0]; ws = wb.Sheets[sheetName]; }

      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!rows.length) {
        _toast('⚠ الملف فارغ أو التنسيق غير صحيح', 'err');
        if (btn) { btn.textContent = 'استيراد Excel'; btn.disabled = false; }
        return;
      }

      // تحديد الأعمدة بمرونة
      const keys    = Object.keys(rows[0]);
      const fk      = (...ns) => keys.find(k => ns.some(n => k.includes(n))) || '';
      const kDate   = fk('التاريخ', 'date', 'تاريخ');
      const kRef    = fk('السند', 'المرجع', 'ref', 'سند');
      const kPlate  = fk('اللوحة', 'plate', 'لوحة', 'شاحنة');
      const kType   = fk('النوع', 'type', 'نوع');
      const kDesc   = fk('البيان', 'الوصف', 'desc', 'بيان');
      const kMet    = fk('أمتار', 'متر', 'met', 'meters');
      const kRaw    = fk('الأصلية', 'rawMeters', 'raw');
      const kDed    = fk('الخصم', 'deducted', 'خصم');
      const kDeb    = fk('وارد', 'deb', 'Deb');
      const kCrd    = fk('صادر', 'crd', 'Crd', 'مبلغ', 'amount');
      const kShift  = fk('وردية', 'الوردية', 'shift');
      const kNotes  = fk('ملاحظات', 'notes');

      const typeMap = {
        'سند أمتار': 'meter', '📏 سند أمتار': 'meter', 'meter': 'meter',
        'استلام': 'custody_r', '📥 استلام': 'custody_r', 'custody_r': 'custody_r',
        'تسليم': 'custody_d', '📤 تسليم': 'custody_d', 'custody_d': 'custody_d',
        'مصروف': 'expense', '💸 مصروف': 'expense', 'expense': 'expense',
      };

      // معاينة للمستخدم
      const p1 = rows[0] ? ('1: ' + (rows[0][kDate]||'') + ' | ' + (rows[0][kType]||'') + ' | ' + (rows[0][kDesc]||'')) : '';
      const p2 = rows[1] ? ('2: ' + (rows[1][kDate]||'') + ' | ' + (rows[1][kType]||'') + ' | ' + (rows[1][kDesc]||'')) : '';
      const p3 = rows[2] ? ('3: ' + (rows[2][kDate]||'') + ' | ' + (rows[2][kType]||'') + ' | ' + (rows[2][kDesc]||'')) : '';
      const preview = [p1, p2, p3].filter(Boolean).join('\n');

      const msg = 'استيراد من: ' + file.name + '\nالشيت: ' + sheetName + '\nعدد الصفوف: ' + rows.length + '\n\nمعاينة:\n' + preview + '\n\nهل تريد الاستيراد؟';
      if (!confirm(msg)) {
        if (btn) { btn.textContent = 'استيراد Excel'; btn.disabled = false; }
        return;
      }

      if (btn) btn.textContent = 'جاري الاستيراد...';
      let count = 0, skipped = 0;
      const now = new Date().toISOString();

      for (const r of rows) {
        const desc = String(r[kDesc] || '').trim();
        if (!desc || desc === 'الإجمالي' || desc === 'الإجماليات') { skipped++; continue; }

        let date = String(r[kDate] || '').trim();
        if (!date) { skipped++; continue; }
        if (date.includes('/')) {
          const p = date.split('/');
          if (p.length === 3) {
            date = p[2].length === 4
              ? (p[2] + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0'))
              : (p[0] + '-' + p[1].padStart(2,'0') + '-' + p[2].padStart(2,'0'));
          }
        }

        const rawType = String(r[kType] || '').trim();
        const type    = typeMap[rawType] || 'expense';
        const deb     = parseFloat(String(r[kDeb] || '0').replace(/,/g, '')) || 0;
        const crd     = parseFloat(String(r[kCrd] || '0').replace(/,/g, '')) || 0;
        const met     = parseFloat(String(r[kMet] || r[kRaw] || '0').replace(/,/g, '')) || 0;
        const ded     = parseFloat(String(r[kDed] || '0').replace(/,/g, '')) || 0;

        await addDoc(collection(db, COLL.ENTRIES), {
          date, type,
          ref:           String(r[kRef]   || '').trim(),
          plate:         String(r[kPlate] || '').trim(),
          desc,
          deb, crd, met,
          deducted:      ded,
          rawMeters:     met,
          shift:         String(r[kShift] || '').includes('مساء') ? 'night' : 'day',
          notes:         String(r[kNotes] || '').trim(),
          importedFrom:  'excel',
          importedAt:    now,
          importedBy:    currentUser?.email || '',
          createdBy:     currentUser?.email || '',
          createdByName: currentUser?.email?.split('@')[0] || '',
          createdAt:     now,
        });
        count++;
      }

      await writeAuditLog('IMPORT_EXCEL', { count, skipped, file: file.name });
      _toast('✅ تم استيراد ' + count + ' سجل (تجاهل ' + skipped + ' صف)', 'ok');

    } catch (e) {
      console.error('[ImportExcel]', e);
      _toast('⚠ خطأ في قراءة الملف — تأكد أن الملف بصيغة xlsx صحيحة', 'err');
    }
    if (btn) { btn.textContent = 'استيراد Excel'; btn.disabled = false; }
  };
  input.click();
}

// ══════════════════════════════
// Audit Log Viewer
// ══════════════════════════════
export async function loadAuditLog() {
  const el = g('audit-log-list');
  if (!el) return;
  el.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text3);font-size:.8rem">جاري التحميل...</div>';
  try {
    const snap = await getDocs(collection(db, COLL.AUDIT_LOG));
    const logs = []; snap.forEach(d => logs.push({id:d.id,...d.data()}));
    logs.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    if (!logs.length) { el.innerHTML='<div style="padding:14px;text-align:center;color:var(--text3)">لا توجد سجلات بعد</div>'; return; }
    const actionLabels = { ADD_METER:'➕ سند أمتار', ADD_CUSTODY_IN:'📥 استلام عهدة', ADD_CUSTODY_OUT:'📤 تسليم عهدة', ADD_EXPENSE:'💸 مصروف', EDIT_ENTRY:'✏️ تعديل', DELETE_ENTRY:'🗑 حذف', EXPORT_JSON:'📤 تصدير JSON', IMPORT_JSON:'📥 استيراد JSON' };
    const actionColors = { ADD_METER:'badge-meter', ADD_CUSTODY_IN:'badge-in', ADD_CUSTODY_OUT:'badge-out', ADD_EXPENSE:'badge-exp', EDIT_ENTRY:'badge-meter', DELETE_ENTRY:'badge-exp', EXPORT_JSON:'badge-in', IMPORT_JSON:'badge-out' };
    el.innerHTML = `<div class="scroll-x"><table style="min-width:500px;font-size:.76rem">
      <thead><tr><th>التاريخ والوقت</th><th>الإجراء</th><th>بواسطة</th><th>التفاصيل</th></tr></thead>
      <tbody>${logs.slice(0,50).map(l => {
        const dt  = l.timestamp ? new Date(l.timestamp).toLocaleString('ar-SA',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        const det = l.details ? Object.entries(l.details).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`).join(' | ') : '—';
        const cls = actionColors[l.action] || 'badge-meter';
        return `<tr>
          <td style="color:var(--text3);white-space:nowrap;font-size:.7rem">${dt}</td>
          <td><span class="badge ${cls}" style="font-size:.6rem">${actionLabels[l.action]||l.action}</span></td>
          <td style="color:var(--b600);font-weight:700;font-size:.74rem">${l.performedByName||l.performedBy||'—'}</td>
          <td style="font-size:.66rem;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${det}">${det}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <p style="font-size:.68rem;color:var(--text3);padding:6px 4px 0">يعرض آخر 50 عملية — الأحدث أولاً</p>`;
  } catch(e) { el.innerHTML='<div style="padding:14px;color:var(--red);text-align:center">خطأ في التحميل</div>'; }
}

// ══════════════════════════════
// دوال مساعدة خاصة بالملف
// ══════════════════════════════
function _today() { return new Date().toISOString().split('T')[0]; }
function _openPrint(html) { const w=window.open('','_blank'); if(w){ w.document.write(html); w.document.close(); } }
function _toast(msg,type='') { const fn=_ctx?.helpers?.toast; if(fn) fn(msg,type); else console.log(msg); }

/** أنماط Excel موحدة */
function _xlsxStyles(cen, rit) {
  function med() { return {top:{style:'medium',color:{rgb:'FF0A1628'}},bottom:{style:'medium',color:{rgb:'FF0A1628'}},left:{style:'medium',color:{rgb:'FF0A1628'}},right:{style:'medium',color:{rgb:'FF0A1628'}}}; }
  function thin(){ return {top:{style:'thin',color:{rgb:'FFDDE8FF'}},bottom:{style:'thin',color:{rgb:'FFDDE8FF'}},left:{style:'thin',color:{rgb:'FFDDE8FF'}},right:{style:'thin',color:{rgb:'FFDDE8FF'}}}; }
  return {
    title: {font:{bold:true,sz:13,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF0A1628'}},alignment:cen,border:med()},
    hdr:   {font:{bold:true,sz:10,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF1A3A6B'}},alignment:cen,border:med()},
    rowW:  {font:{sz:10},alignment:cen,border:thin()},
    rowA:  {font:{sz:10},fill:{fgColor:{rgb:'FFF0F5FF'}},alignment:cen,border:thin()},
    rowWR: {font:{sz:10},alignment:rit,border:thin()},
    rowAR: {font:{sz:10},fill:{fgColor:{rgb:'FFF0F5FF'}},alignment:rit,border:thin()},
    deb:   {font:{bold:true,sz:10,color:{rgb:'FF15803D'}},fill:{fgColor:{rgb:'FFDCFCE7'}},alignment:cen,border:thin()},
    crd:   {font:{bold:true,sz:10,color:{rgb:'FFB91C1C'}},fill:{fgColor:{rgb:'FFFEE2E2'}},alignment:cen,border:thin()},
    balP:  {font:{bold:true,sz:10,color:{rgb:'FF15803D'}},fill:{fgColor:{rgb:'FFDCFCE7'}},alignment:cen,border:thin()},
    balN:  {font:{bold:true,sz:10,color:{rgb:'FFB91C1C'}},fill:{fgColor:{rgb:'FFFEE2E2'}},alignment:cen,border:thin()},
    tot:   {font:{bold:true,sz:11,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF0A1628'}},alignment:cen,border:med()},
  };
}
function _newWorkbook() {
  const wb = XLSX.utils.book_new();
  if (!wb.Workbook)       wb.Workbook = {};
  if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
  wb.Workbook.Views[0].RTL = true;
  return wb;
}
