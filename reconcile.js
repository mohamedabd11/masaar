// ══════════════════════════════════════════════════════════
// reconcile.js — مطابقة كشف المقاول
// ══════════════════════════════════════════════════════════

let _ctx  = null;
let _rows = [];

export function initReconcile(ctx) {
  _ctx  = ctx;
  _rows = [];
}

export function addRecRow() {
  _rows.push({
    slNo:      _rows.length + 1,
    date:      '',
    truck:     '',
    tripSheet: '',
    rawM:      0,
    deducted:  0,
    certM:     0
  });
  _renderTable();
  // مزامنة window._recRows للتوافق مع الكود القديم
  window._recRows = _rows;
}

export function removeRecRow(i) {
  _rows.splice(i, 1);
  _renderTable();
  window._recRows = _rows;
}

export function calcRecRow(i) {
  const r = _rows[i]; if (!r) return;
  r.certM = +(Math.max(0, r.rawM - r.deducted)).toFixed(2);
  const { helpers: { g } } = _ctx;
  const cells = g('rec-input-tbody')?.rows[i]?.cells;
  if (cells && cells[6]) cells[6].textContent = r.certM + 'م';
  window._recRows = _rows;
}

export function runReconcileUI() {
  const { getState, helpers: { g, toast } } = _ctx;
  if (!_rows.length) { toast('⚠ أضف صفوفاً في جدول الكشف', 'err'); return; }

  const AppState    = getState();
  const meterEntries = AppState.entries.filter(e => e.type === 'meter');
  const from        = g('rec-from')?.value || '';
  const to          = g('rec-to')?.value   || '';
  const filtered    = (from || to)
    ? meterEntries.filter(e => (!from || e.date >= from) && (!to || e.date <= to))
    : meterEntries;

  // استدعاء runReconcile من reports.js عبر window
  if (typeof window._runReconcileReport === 'function') {
    window._runReconcileReport(_rows, filtered, AppState.invoicePrice);
  }
}

function _renderTable() {
  const { helpers: { g } } = _ctx;
  const tb = g('rec-input-tbody'); if (!tb) return;

  if (!_rows.length) {
    tb.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:var(--text3)">اضغط "إضافة صف" لبدء إدخال بيانات الكشف</td></tr>';
    return;
  }

  tb.innerHTML = _rows.map((r, i) => `<tr>
    <td>${r.slNo || i + 1}</td>
    <td><input type="date" value="${r.date}" oninput="_recRowUpdate(${i},'date',this.value)" style="min-width:120px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="text" value="${r.truck}" placeholder="رقم الشاحنة" oninput="_recRowUpdate(${i},'truck',this.value)" style="min-width:100px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="text" value="${r.tripSheet}" placeholder="رقم القسيمة" oninput="_recRowUpdate(${i},'tripSheet',this.value)" style="min-width:100px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="number" value="${r.rawM || ''}" placeholder="0" min="0" step="0.5" oninput="_recRowUpdate(${i},'rawM',parseFloat(this.value)||0);window.calcRecRow(${i})" style="min-width:90px;padding:5px 8px;font-size:.8rem"></td>
    <td><input type="number" value="${r.deducted || ''}" placeholder="0" min="0" step="0.5" oninput="_recRowUpdate(${i},'deducted',parseFloat(this.value)||0);window.calcRecRow(${i})" style="min-width:90px;padding:5px 8px;font-size:.8rem"></td>
    <td style="font-weight:800;color:var(--b600)">${r.certM || 0}م</td>
    <td><button onclick="removeRecRow(${i})" style="background:var(--red2);border:1px solid var(--red);border-radius:5px;padding:3px 10px;cursor:pointer;font-size:.8rem;color:var(--red)">✕</button></td>
  </tr>`).join('');
}

// مساعد داخلي للـ inline oninput
window._recRowUpdate = (i, field, val) => {
  if (_rows[i]) { _rows[i][field] = val; window._recRows = _rows; }
};
