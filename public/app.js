const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  view: 'dashboard',
  month: new Date().toISOString().slice(0, 7),
  settings: {},
  categories: [],
  txType: 'expense',
  filters: { q: '', type: '', category: '', from: '', to: '', sort: 'date', order: 'desc', page: 1 },
  pendingConfirm: null
};

const PALETTE = [
  '#6366f1', '#22c55e', '#f97316', '#06b6d4', '#ec4899',
  '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6', '#3b82f6',
  '#a855f7', '#84cc16', '#f43f5e', '#0ea5e9', '#64748b'
];

/* ============ API ============ */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ============ HELPERS ============ */
function currency(n) {
  const cur = state.settings.currency || 'INR';
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: cur,
    maximumFractionDigits: 2
  }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2800);
}

function catById(id) { return state.categories.find((c) => c.id === id); }

function openModal(sel) { $(sel).classList.add('open'); }
function closeModal(sel) { $(sel).classList.remove('open'); }

function confirmAction(title, msg, yesLabel, fn) {
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = msg;
  $('#confirm-yes').textContent = yesLabel;
  state.pendingConfirm = fn;
  openModal('#confirm-modal');
}

/* ============ ICONS / LETTERS ============ */
function txIcon(cat) {
  const letter = (cat?.name || '?').charAt(0).toUpperCase();
  return `<div class="tx-icon" style="background:${cat?.color || '#64748b'}">${letter}</div>`;
}

/* ============ VIEWS ============ */
const VIEW_META = {
  dashboard: ['Dashboard', 'Overview of your money'],
  transactions: ['Transactions', 'Search, filter and manage entries'],
  budgets: ['Budgets', 'Monthly limits per category'],
  goals: ['Goals', 'Track your savings targets'],
  analytics: ['Analytics', 'Trends and breakdowns'],
  categories: ['Categories', 'Organize how you classify money'],
  settings: ['Settings', 'Preferences and data management']
};

function switchView(view) {
  state.view = view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $('#view-title').textContent = VIEW_META[view][0];
  $('#view-sub').textContent = VIEW_META[view][1];
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('open');
  render();
}

async function render() {
  try {
    if (state.view === 'dashboard') await renderDashboard();
    else if (state.view === 'transactions') await renderTransactions();
    else if (state.view === 'budgets') await renderBudgets();
    else if (state.view === 'goals') await renderGoals();
    else if (state.view === 'analytics') await renderAnalytics();
    else if (state.view === 'categories') renderCategories();
    else if (state.view === 'settings') await renderSettings();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  const [summary, trends] = await Promise.all([
    api(`/summary?month=${state.month}`),
    api('/analytics/trends?months=6')
  ]);

  const prevKey = (() => {
    const [y, m] = state.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prev = trends.find((t) => t.month === prevKey);
  const delta = prev && prev.expense > 0
    ? Math.round(((summary.expense - prev.expense) / prev.expense) * 100)
    : null;

  $('#stat-grid').innerHTML = `
    <div class="stat-card income">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <span class="stat-label">Income · ${esc(monthName(state.month).split(' ')[0])}</span>
      <span class="stat-value">${currency(summary.income)}</span>
      <span class="stat-meta">${summary.savingsRate}% savings rate</span>
    </div>
    <div class="stat-card expense">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div>
      <span class="stat-label">Expenses</span>
      <span class="stat-value">${currency(summary.expense)}</span>
      <span class="stat-meta">${delta === null ? 'No comparison' : delta >= 0 ? `<span class="trend-down">▲ ${delta}%</span> vs last month` : `<span class="trend-up">▼ ${Math.abs(delta)}%</span> vs last month`}</span>
    </div>
    <div class="stat-card balance">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <span class="stat-label">Net this month</span>
      <span class="stat-value" style="${summary.net < 0 ? 'color:var(--expense)' : ''}">${currency(summary.net)}</span>
      <span class="stat-meta">Balance after expenses</span>
    </div>
    <div class="stat-card rate">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
      <span class="stat-label">Budgets on track</span>
      <span class="stat-value">${summary.budgets.filter((b) => b.status === 'ok').length}/${summary.budgets.length}</span>
      <span class="stat-meta">${summary.budgets.filter((b) => b.status === 'over').length} over limit</span>
    </div>`;

  renderTrendChart($('#chart-trend'), trends);
  renderDonut($('#chart-donut'), $('#donut-legend'), await api(`/analytics/breakdown?month=${state.month}`), $('#breakdown-total'));

  const budgetHost = $('#dash-budgets');
  if (!summary.budgets.length) {
    budgetHost.innerHTML = `<div class="empty"><p>No budgets set yet.</p></div>`;
  } else {
    budgetHost.innerHTML = summary.budgets.slice(0, 5).map(budgetRowHTML).join('');
  }

  const recentHost = $('#dash-recent');
  if (!summary.recent.length) {
    recentHost.innerHTML = `<div class="empty"><p>No transactions yet.</p></div>`;
  } else {
    recentHost.innerHTML = summary.recent.map((t) => {
      const cat = { name: t.categoryName, color: t.categoryColor };
      return `<div class="tx-row">
        ${txIcon(cat)}
        <div class="tx-info">
          <div class="tx-note">${esc(t.note || t.categoryName)}</div>
          <div class="tx-meta"><span>${esc(t.categoryName)}</span><span>·</span><span>${fmtDate(t.date)}</span></div>
        </div>
        <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${currency(t.amount)}</div>
      </div>`;
    }).join('');
  }

  const alertCount = summary.budgets.filter((b) => b.status !== 'ok').length;
  const badge = $('#budget-alert-badge');
  badge.classList.toggle('hidden', alertCount === 0);
  badge.textContent = alertCount;
}

function budgetRowHTML(b) {
  const pct = Math.min(b.pct, 100);
  return `<div class="budget-row ${b.status}">
    <div class="budget-top">
      <i class="dot" style="background:${b.color}"></i>
      <span class="name">${esc(b.categoryName)}</span>
      <span class="amt"><b>${currency(b.spent)}</b> / ${currency(b.limit)}</span>
      <span class="budget-actions">
        <button class="icon-btn" data-budget-edit="${b.id}" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn danger" data-budget-del="${b.id}" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </span>
    </div>
    <div class="progress"><span class="${b.status}" style="width:${pct}%"></span></div>
    <div class="budget-bottom">
      <span>${b.pct}% used</span>
      <span>${b.remaining >= 0 ? currency(b.remaining) + ' left' : currency(Math.abs(b.remaining)) + ' over'}</span>
    </div>
  </div>`;
}

/* ============ CHARTS ============ */
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const mult = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((m) => m * base >= v);
  return mult * base;
}

function renderTrendChart(host, trends) {
  if (!host) return;
  const W = 640, H = 250, pad = { t: 16, r: 8, b: 32, l: 56 };
  const max = niceMax(Math.max(...trends.map((t) => Math.max(t.income, t.expense)), 0));
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const n = trends.length;
  const groupW = innerW / n;
  const gap = Math.min(6, groupW * 0.12);
  const pairW = Math.max(groupW - gap * 2, 8);
  const barW = Math.max(Math.min(pairW / 2 - 2, 22), 3);

  const yScale = (v) => pad.t + innerH - (v / max) * innerH;
  const baseY = pad.t + innerH;
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const y = yScale(v);
    svg += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--border)" stroke-dasharray="${i === 0 ? '0' : '3 4'}"/>`;
    svg += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)">${compact(v)}</text>`;
  }

  const labelEvery = Math.ceil(n / 12);

  trends.forEach((t, i) => {
    const cx = pad.l + groupW * i + groupW / 2;
    const hi = Math.max((t.income / max) * innerH, t.income > 0 ? 2 : 0);
    const he = Math.max((t.expense / max) * innerH, t.expense > 0 ? 2 : 0);
    const xi = cx - gap / 2 - barW, xe = cx + gap / 2;
    svg += `<rect class="bar" x="${xi}" y="${baseY - hi}" width="${barW}" height="${hi}" rx="3" fill="var(--income)"><title>${t.label}: income ${currency(t.income)}</title></rect>`;
    svg += `<rect class="bar" x="${xe}" y="${baseY - he}" width="${barW}" height="${he}" rx="3" fill="var(--expense)"><title>${t.label}: expense ${currency(t.expense)}</title></rect>`;
    if (i % labelEvery === 0 || i === n - 1) {
      svg += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${t.label}</text>`;
    }
  });

  svg += `</svg>`;
  host.innerHTML = svg;
}

function compact(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return Math.round(v).toString();
}

function renderDonut(host, legendHost, data, totalHost) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  if (totalHost) totalHost.textContent = total ? `${currency(total)} total` : 'No expenses';

  if (!total) {
    host.innerHTML = `<div class="empty" style="padding:50px 10px"><p>No expenses this month</p></div>`;
    if (legendHost) legendHost.innerHTML = '';
    return;
  }

  const shown = data.slice(0, 6);
  const rest = data.slice(6);
  if (rest.length) {
    shown.push({
      name: 'Other',
      color: '#64748b',
      amount: rest.reduce((s, d) => s + d.amount, 0),
      pct: Math.round((rest.reduce((s, d) => s + d.amount, 0) / total) * 1000) / 10
    });
  }

  const size = 200, r = 74, stroke = 30, cxy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let svg = `<svg viewBox="0 0 ${size} ${size}">`;

  svg += `<circle cx="${cxy}" cy="${cxy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>`;

  shown.forEach((d) => {
    const frac = d.amount / total;
    const len = frac * circ;
    svg += `<circle cx="${cxy}" cy="${cxy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(len - 2, 0)} ${circ - Math.max(len - 2, 0)}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cxy} ${cxy})"
      stroke-linecap="round"><title>${esc(d.name)}: ${currency(d.amount)} (${d.pct || Math.round(frac * 100)}%)</title></circle>`;
    offset += len;
  });

  svg += `<text x="${cxy}" y="${cxy - 4}" text-anchor="middle" font-size="12" fill="var(--text-3)" stroke="none">${esc(monthName(state.month).split(' ')[0])}</text>`;
  svg += `<text x="${cxy}" y="${cxy + 16}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)" stroke="none">${compact(total)}</text>`;
  svg += `</svg>`;
  host.innerHTML = svg;

  if (legendHost) {
    legendHost.innerHTML = shown.map((d) => `
      <div class="donut-row">
        <i class="dot" style="background:${d.color}"></i>
        <span class="name">${esc(d.name)}</span>
        <span class="val">${currency(d.amount)}</span>
        <span class="pct">${d.pct || Math.round((d.amount / total) * 100)}%</span>
      </div>`).join('');
  }
}

function renderDailyChart(host, days) {
  const W = 640, H = 230, pad = { t: 14, r: 8, b: 28, l: 48 };
  const max = niceMax(Math.max(...days.map((d) => d.expense), 0));
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const step = innerW / Math.max(days.length - 1, 1);
  const yS = (v) => pad.t + innerH - (v / max) * innerH;

  let path = '', area = '';
  days.forEach((d, i) => {
    const x = pad.l + i * step, y = yS(d.expense);
    path += (i === 0 ? 'M' : 'L') + x + ',' + y;
  });
  area = path + `L${pad.l + (days.length - 1) * step},${pad.t + innerH}L${pad.l},${pad.t + innerH}Z`;

  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, y = yS(v);
    svg += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 4"/>`;
    svg += `<text x="${pad.l - 7}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)">${compact(v)}</text>`;
  }
  svg += `<path d="${area}" fill="var(--accent-soft)" stroke="none"/>`;
  svg += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;

  days.forEach((d, i) => {
    if (d.expense > 0) {
      const x = pad.l + i * step, y = yS(d.expense);
      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"><title>Day ${d.day}: ${currency(d.expense)}</title></circle>`;
    }
  });

  [1, 8, 15, 22, days.length].forEach((dayNum) => {
    const i = dayNum - 1;
    if (i >= 0 && i < days.length) {
      const x = pad.l + i * step;
      svg += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text-3)">${dayNum}</text>`;
    }
  });
  svg += `</svg>`;
  host.innerHTML = svg;
}

/* ============ TRANSACTIONS ============ */
async function renderTransactions() {
  const f = state.filters;
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.type) params.set('type', f.type);
  if (f.category) params.set('category', f.category);
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  params.set('sort', f.sort);
  params.set('order', f.order);
  params.set('page', f.page);
  params.set('limit', 15);

  const data = await api('/transactions?' + params.toString());
  const body = $('#tx-body');
  const empty = $('#tx-empty');

  $('#tx-summary').innerHTML = `
    <span><b>${data.summary.count}</b> transactions</span>
    <span class="s-in">Income: <b>${currency(data.summary.income)}</b></span>
    <span class="s-out">Expense: <b>${currency(data.summary.expense)}</b></span>`;

  if (!data.items.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    body.innerHTML = data.items.map((t) => `
      <tr>
        <td style="white-space:nowrap">${fmtDate(t.date)}</td>
        <td><span class="chip"><i style="background:${t.categoryColor}"></i>${esc(t.categoryName)}</span></td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.note)}">${esc(t.note) || '<span style="color:var(--text-3)">—</span>'}</td>
        <td class="num ${t.type}" style="font-weight:700;color:${t.type === 'income' ? 'var(--income)' : 'var(--text)'}">${t.type === 'income' ? '+' : '−'}${currency(t.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-tx-edit="${t.id}" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="icon-btn danger" data-tx-del="${t.id}" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPager(data.page, data.totalPages, data.total);
}

function renderPager(page, totalPages, total) {
  const host = $('#tx-pager');
  if (total === 0) { host.innerHTML = ''; return; }
  let html = `<button ${page <= 1 ? 'disabled' : ''} data-pg="${page - 1}">‹</button>`;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  for (const p of pages) {
    html += p === '…'
      ? `<span class="pager-info">…</span>`
      : `<button class="${p === page ? 'active' : ''}" data-pg="${p}">${p}</button>`;
  }
  html += `<button ${page >= totalPages ? 'disabled' : ''} data-pg="${page + 1}">›</button>`;
  html += `<span class="pager-info">${total} total</span>`;
  host.innerHTML = html;
}

function openTxModal(tx = null) {
  const editing = !!tx;
  $('#tx-modal-title').textContent = editing ? 'Edit transaction' : 'Add transaction';
  $('#tx-submit').textContent = editing ? 'Save changes' : 'Add transaction';
  state.txType = tx ? tx.type : 'expense';
  $$('#tx-type button').forEach((b) => b.classList.toggle('active', b.dataset.type === state.txType));
  $('#t-amount').value = tx ? tx.amount : '';
  $('#t-date').value = tx ? tx.date : new Date().toISOString().slice(0, 10);
  $('#t-note').value = tx ? (tx.note || '') : '';
  $('#t-method').value = tx ? (tx.paymentMethod || 'card') : 'card';
  fillTxCategorySelect(tx ? tx.categoryId : null);
  $('#t-amount').dataset.editId = editing ? tx.id : '';
  $('#amount-currency').textContent = currencySymbol();
  openModal('#tx-modal');
  setTimeout(() => $('#t-amount').focus(), 80);
}

function currencySymbol() {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency || 'INR' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || '₹';
  } catch { return '₹'; }
}

function fillTxCategorySelect(selectedId) {
  const list = state.categories.filter((c) => c.type === state.txType);
  $('#t-category').innerHTML = list.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

/* ============ BUDGETS ============ */
async function renderBudgets() {
  const [summary, budgets, expenseCats] = await Promise.all([
    api(`/summary?month=${state.month}`),
    api('/budgets'),
    api('/categories?type=expense')
  ]);

  $('#budget-month-label').textContent = monthName(state.month);
  const host = $('#budget-list');
  $('#budget-empty').classList.toggle('hidden', summary.budgets.length > 0);
  host.innerHTML = summary.budgets.map(budgetRowHTML).join('');

  const assigned = new Set(budgets.map((b) => b.categoryId));
  const free = expenseCats.filter((c) => !assigned.has(c.id));
  const current = $('#b-id').value;
  const options = expenseCats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#b-category').innerHTML = options;
  if (!current && free.length) $('#b-category').value = free[0].id;
}

function resetBudgetForm() {
  $('#b-id').value = '';
  $('#b-amount').value = '';
  $('#budget-form-title').textContent = 'Add budget';
  $('#budget-cancel').classList.add('hidden');
}

/* ============ GOALS ============ */
async function renderGoals() {
  const goals = await api('/goals');
  const host = $('#goals-list');
  $('#goals-empty').classList.toggle('hidden', goals.length > 0);

  host.innerHTML = goals.map((g) => {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    const remaining = Math.max(0, g.target - g.saved);
    const contribs = [...(g.contributions || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    return `<div class="goal-card">
      <div class="goal-top">
        <div class="goal-info">
          <div class="goal-name">${esc(g.name)}</div>
          <div class="goal-deadline">${g.deadline ? 'Deadline: ' + fmtDate(g.deadline) : 'No deadline'}</div>
        </div>
        <div class="goal-pct">${pct}%</div>
      </div>
      <div class="progress"><span class="${pct >= 100 ? 'ok' : pct >= 70 ? 'ok' : 'warn'}" style="width:${pct}%"></span></div>
      <div class="goal-nums">
        <span><b>${currency(g.saved)}</b> saved</span>
        <span>of ${currency(g.target)}</span>
        <span>${currency(remaining)} to go</span>
      </div>
      <div class="goal-actions">
        <button class="btn btn-primary" style="padding:7px 12px;font-size:12.5px" data-contrib="${g.id}">+ Deposit</button>
        <button class="btn btn-ghost" style="padding:7px 12px;font-size:12.5px" data-goal-edit="${g.id}">Edit</button>
        <button class="btn btn-ghost" style="padding:7px 12px;font-size:12.5px" data-goal-del="${g.id}">Delete</button>
      </div>
      ${contribs.length ? `<div class="contrib-list">${contribs.map((c) => `
        <div class="contrib-item">
          <span class="c-date">${fmtDate(c.date)}</span>
          <span class="c-amt">${currency(c.amount)}</span>
          <button class="icon-btn danger" data-contrib-del="${g.id}:${c.id}" title="Remove"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function resetGoalForm() {
  $('#g-id').value = '';
  $('#g-name').value = '';
  $('#g-target').value = '';
  $('#g-deadline').value = '';
  $('#goal-form-title').textContent = 'New savings goal';
  $('#goal-cancel').classList.add('hidden');
}

/* ============ ANALYTICS ============ */
async function renderAnalytics() {
  const range = Number($('#trend-range').value) || 6;
  const [stats, trends, daily, breakdown, summary] = await Promise.all([
    api('/stats'),
    api(`/analytics/trends?months=${range}`),
    api(`/analytics/daily?month=${state.month}`),
    api(`/analytics/breakdown?month=${state.month}`),
    api(`/summary?month=${state.month}`)
  ]);

  const avgDaily = daily.reduce((s, d) => s + d.expense, 0) / Math.max(new Date(Number(state.month.slice(0, 4)), Number(state.month.slice(5, 7)), 0).getDate(), 1);
  const bestMonth = [...trends].sort((a, b) => b.net - a.net)[0];

  $('#analytics-stats').innerHTML = `
    <div class="stat-card balance">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <span class="stat-label">All-time balance</span>
      <span class="stat-value" style="${stats.balance < 0 ? 'color:var(--expense)' : ''}">${currency(stats.balance)}</span>
      <span class="stat-meta">${stats.monthsTracked} months tracked</span>
    </div>
    <div class="stat-card income">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <span class="stat-label">All-time income</span>
      <span class="stat-value">${currency(stats.totalIncome)}</span>
      <span class="stat-meta">${stats.transactions} transactions</span>
    </div>
    <div class="stat-card expense">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div>
      <span class="stat-label">Avg daily spend</span>
      <span class="stat-value">${currency(avgDaily)}</span>
      <span class="stat-meta">This month</span>
    </div>
    <div class="stat-card rate">
      <div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <span class="stat-label">Best month</span>
      <span class="stat-value">${bestMonth ? currency(bestMonth.net) : '—'}</span>
      <span class="stat-meta">${bestMonth ? bestMonth.label + ' (net)' : ''}</span>
    </div>`;

  renderTrendChart($('#chart-months'), trends);
  renderDailyChart($('#chart-daily'), daily);
  $('#daily-sub').textContent = monthName(state.month);

  const maxAmt = breakdown[0]?.amount || 1;
  $('#analytics-breakdown').innerHTML = breakdown.length ? breakdown.map((d) => `
    <div class="budget-row">
      <div class="budget-top">
        <i class="dot" style="background:${d.color}"></i>
        <span class="name">${esc(d.name)}</span>
        <span class="amt"><b>${currency(d.amount)}</b> · ${d.pct}%</span>
      </div>
      <div class="progress"><span class="ok" style="width:${Math.round((d.amount / maxAmt) * 100)}%;background:${d.color}"></span></div>
    </div>`).join('') : `<div class="empty"><p>No expenses this month</p></div>`;

  $('#top-expenses').innerHTML = summary.topExpenses.length ? summary.topExpenses.map((t) => `
    <div class="tx-row">
      <div class="tx-icon" style="background:${t.categoryColor || '#64748b'}">${esc((t.categoryName || '?').charAt(0))}</div>
      <div class="tx-info">
        <div class="tx-note">${esc(t.note || t.categoryName)}</div>
        <div class="tx-meta"><span>${esc(t.categoryName)}</span><span>·</span><span>${fmtDate(t.date)}</span></div>
      </div>
      <div class="tx-amount">${currency(t.amount)}</div>
    </div>`).join('') : `<div class="empty"><p>No expenses this month</p></div>`;
}

/* ============ CATEGORIES ============ */
function renderCategories() {
  const renderList = (type) => state.categories
    .filter((c) => c.type === type)
    .map((c) => `<div class="cat-row">
      <i class="cat-swatch" style="background:${c.color}"></i>
      <span class="cat-name">${esc(c.name)}</span>
      <span class="cat-count">${c.txCount || 0}</span>
      <span class="budget-actions">
        <button class="icon-btn" data-cat-edit="${c.id}" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn danger" data-cat-del="${c.id}" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </span>
    </div>`).join('');

  $('#cat-expense').innerHTML = renderList('expense') || '<div class="empty"><p>None</p></div>';
  $('#cat-income').innerHTML = renderList('income') || '<div class="empty"><p>None</p></div>';
}

function buildColorRow() {
  $('#c-color-row').innerHTML = PALETTE.map((c) =>
    `<button type="button" class="color-opt ${c === $('#c-color').value ? 'selected' : ''}" style="background:${c}" data-color="${c}"></button>`
  ).join('');
}

function resetCatForm() {
  $('#c-id').value = '';
  $('#c-name').value = '';
  $('#c-type').value = 'expense';
  $('#c-color').value = '#6366f1';
  $('#cat-form-title').textContent = 'Add category';
  $('#cat-cancel').classList.add('hidden');
  buildColorRow();
}

/* ============ SETTINGS ============ */
async function renderSettings() {
  const stats = await api('/stats');
  $('#s-name').value = state.settings.name || '';
  $('#s-currency').value = state.settings.currency || 'INR';
  $$('#s-theme button').forEach((b) => b.classList.toggle('active', b.dataset.themeVal === state.settings.theme));

  $('#about-grid').innerHTML = [
    ['Transactions', stats.transactions],
    ['Categories', stats.categories],
    ['Budgets', stats.budgets],
    ['Goals', stats.goals],
    ['Months tracked', stats.monthsTracked],
    ['All-time balance', currency(stats.balance)]
  ].map(([k, v]) => `<div class="about-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

/* ============ INIT ============ */
async function init() {
  state.settings = await api('/settings');
  applyTheme(state.settings.theme);
  $('#brand-name').textContent = state.settings.name || 'Ledger';

  state.categories = await api('/categories');
  buildColorRow();

  $('#month-label').textContent = monthName(state.month);
  $('#amount-currency').textContent = currencySymbol();

  const catFilter = $('#f-category');
  catFilter.innerHTML = '<option value="">All categories</option>' +
    state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  await render();

  const stats = await api('/stats');
  $('#sidebar-balance').textContent = currency(stats.balance);

  bindEvents();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

async function refreshCategories() {
  state.categories = await api('/categories');
  const cur = $('#f-category').value;
  $('#f-category').innerHTML = '<option value="">All categories</option>' +
    state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#f-category').value = cur && catById(cur) ? cur : '';
}

function bindEvents() {
  $('#sidebar-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn) switchView(btn.dataset.view);
  });

  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) switchView(goto.dataset.goto);
  });

  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.add('open');
    $('#sidebar-overlay').classList.add('open');
  });
  $('#sidebar-overlay').addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
    $('#sidebar-overlay').classList.remove('open');
  });

  $('#theme-toggle').addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      state.settings = await api('/settings', { method: 'PUT', body: { theme: next } });
      toast(`Switched to ${next} mode`);
    } catch { /* theme applied locally anyway */ }
    render();
  });

  $('#month-prev').addEventListener('click', () => shiftMonth(-1));
  $('#month-next').addEventListener('click', () => shiftMonth(1));

  $('#add-tx-btn').addEventListener('click', () => openTxModal());

  $$('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd || e.target.closest('[data-close]')) bd.classList.remove('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    if (e.key.toLowerCase() === 'n' && !e.target.matches('input, select, textarea') && !$('.modal-backdrop.open')) {
      e.preventDefault();
      openTxModal();
    }
  });

  /* transaction modal */
  $('#tx-type').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    state.txType = btn.dataset.type;
    $$('#tx-type button').forEach((b) => b.classList.toggle('active', b === btn));
    fillTxCategorySelect(null);
  });

  $('#tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = $('#t-amount').dataset.editId;
    const body = {
      type: state.txType,
      amount: Number($('#t-amount').value),
      categoryId: $('#t-category').value,
      date: $('#t-date').value,
      note: $('#t-note').value,
      paymentMethod: $('#t-method').value
    };
    try {
      if (editId) await api('/transactions/' + editId, { method: 'PUT', body });
      else await api('/transactions', { method: 'POST', body });
      closeModal('#tx-modal');
      toast(editId ? 'Transaction updated' : 'Transaction added');
      await refreshCategories();
      const stats = await api('/stats');
      $('#sidebar-balance').textContent = currency(stats.balance);
      render();
    } catch (err) { toast(err.message, 'error'); }
  });

  /* transactions table actions */
  $('#tx-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-tx-edit]');
    const delBtn = e.target.closest('[data-tx-del]');
    if (editBtn) {
      try {
        const tx = await api('/transactions/' + editBtn.dataset.txEdit);
        openTxModal(tx);
      } catch (err) { toast(err.message, 'error'); }
    }
    if (delBtn) {
      confirmAction('Delete transaction?', 'This cannot be undone.', 'Delete', async () => {
        try {
          await api('/transactions/' + delBtn.dataset.txDel, { method: 'DELETE' });
          toast('Transaction deleted');
          const stats = await api('/stats');
          $('#sidebar-balance').textContent = currency(stats.balance);
          render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  });

  $('#tx-pager').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pg]');
    if (!btn || btn.disabled) return;
    state.filters.page = Number(btn.dataset.pg);
    renderTransactions();
  });

  /* filters */
  let filterTimer;
  $('#f-q').addEventListener('input', (e) => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filters.q = e.target.value.trim();
      state.filters.page = 1;
      renderTransactions();
    }, 280);
  });
  ['f-type', 'f-category', 'f-from', 'f-to'].forEach((id) => {
    $('#' + id).addEventListener('change', (e) => {
      state.filters[id.replace('f-', '')] = e.target.value;
      state.filters.page = 1;
      renderTransactions();
    });
  });
  $('#f-reset').addEventListener('click', () => {
    Object.assign(state.filters, { q: '', type: '', category: '', from: '', to: '', page: 1 });
    $('#f-q').value = ''; $('#f-type').value = ''; $('#f-category').value = '';
    $('#f-from').value = ''; $('#f-to').value = '';
    renderTransactions();
  });
  $('#tx-empty-add').addEventListener('click', () => openTxModal());

  $$('#tx-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.filters.sort === key) state.filters.order = state.filters.order === 'asc' ? 'desc' : 'asc';
      else { state.filters.sort = key; state.filters.order = 'desc'; }
      renderTransactions();
    });
  });

  /* budgets */
  $('#budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#b-id').value;
    try {
      if (id) await api('/budgets/' + id, { method: 'PUT', body: { amount: Number($('#b-amount').value) } });
      else await api('/budgets', { method: 'POST', body: { categoryId: $('#b-category').value, amount: Number($('#b-amount').value) } });
      toast(id ? 'Budget updated' : 'Budget created');
      resetBudgetForm();
      render();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#budget-cancel').addEventListener('click', resetBudgetForm);

  document.addEventListener('click', async (e) => {
    const bEdit = e.target.closest('[data-budget-edit]');
    const bDel = e.target.closest('[data-budget-del]');
    if (bEdit) {
      try {
        const budgets = await api('/budgets');
        const b = budgets.find((x) => x.id === bEdit.dataset.budgetEdit);
        if (b) {
          $('#b-id').value = b.id;
          $('#b-category').value = b.categoryId;
          $('#b-amount').value = b.amount;
          $('#budget-form-title').textContent = 'Edit budget';
          $('#budget-cancel').classList.remove('hidden');
        }
      } catch (err) { toast(err.message, 'error'); }
    }
    if (bDel) {
      confirmAction('Delete budget?', 'The spending limit will be removed.', 'Delete', async () => {
        try {
          await api('/budgets/' + bDel.dataset.budgetDel, { method: 'DELETE' });
          toast('Budget deleted');
          resetBudgetForm();
          render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  });

  /* goals */
  $('#goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#g-id').value;
    const body = { name: $('#g-name').value, target: Number($('#g-target').value), deadline: $('#g-deadline').value };
    try {
      if (id) await api('/goals/' + id, { method: 'PUT', body });
      else await api('/goals', { method: 'POST', body });
      toast(id ? 'Goal updated' : 'Goal created');
      resetGoalForm();
      renderGoals();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#goal-cancel').addEventListener('click', resetGoalForm);

  $('#goals-list').addEventListener('click', async (e) => {
    const gEdit = e.target.closest('[data-goal-edit]');
    const gDel = e.target.closest('[data-goal-del]');
    const gContrib = e.target.closest('[data-contrib]');
    const cDel = e.target.closest('[data-contrib-del]');

    if (gEdit) {
      try {
        const goals = await api('/goals');
        const g = goals.find((x) => x.id === gEdit.dataset.goalEdit);
        if (g) {
          $('#g-id').value = g.id;
          $('#g-name').value = g.name;
          $('#g-target').value = g.target;
          $('#g-deadline').value = g.deadline || '';
          $('#goal-form-title').textContent = 'Edit goal';
          $('#goal-cancel').classList.remove('hidden');
        }
      } catch (err) { toast(err.message, 'error'); }
    }
    if (gDel) {
      confirmAction('Delete goal?', 'All contribution history for this goal will be removed.', 'Delete', async () => {
        try {
          await api('/goals/' + gDel.dataset.goalDel, { method: 'DELETE' });
          toast('Goal deleted');
          resetGoalForm();
          renderGoals();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
    if (gContrib) {
      $('#contrib-goal-id').value = gContrib.dataset.contrib;
      $('#contrib-amount').value = '';
      $('#contrib-date').value = new Date().toISOString().slice(0, 10);
      openModal('#contrib-modal');
      setTimeout(() => $('#contrib-amount').focus(), 80);
    }
    if (cDel) {
      const [gid, cid] = cDel.dataset.contribDel.split(':');
      try {
        await api(`/goals/${gid}/contributions/${cid}`, { method: 'DELETE' });
        toast('Contribution removed');
        renderGoals();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  $('#contrib-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/goals/${$('#contrib-goal-id').value}/contributions`, {
        method: 'POST',
        body: { amount: Number($('#contrib-amount').value), date: $('#contrib-date').value }
      });
      closeModal('#contrib-modal');
      toast('Contribution added');
      renderGoals();
    } catch (err) { toast(err.message, 'error'); }
  });

  /* analytics */
  $('#trend-range').addEventListener('change', renderAnalytics);

  /* categories */
  $('#c-color-row').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-color]');
    if (!opt) return;
    $('#c-color').value = opt.dataset.color;
    buildColorRow();
  });

  $('#cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#c-id').value;
    const body = { name: $('#c-name').value, type: $('#c-type').value, color: $('#c-color').value };
    try {
      if (id) await api('/categories/' + id, { method: 'PUT', body });
      else await api('/categories', { method: 'POST', body });
      toast(id ? 'Category updated' : 'Category created');
      resetCatForm();
      await refreshCategories();
      renderCategories();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#cat-cancel').addEventListener('click', resetCatForm);

  document.addEventListener('click', async (e) => {
    const cEdit = e.target.closest('[data-cat-edit]');
    const cDel = e.target.closest('[data-cat-del]');
    if (cEdit) {
      const cat = state.categories.find((c) => c.id === cEdit.dataset.catEdit);
      if (cat) {
        $('#c-id').value = cat.id;
        $('#c-name').value = cat.name;
        $('#c-type').value = cat.type;
        $('#c-color').value = cat.color;
        $('#cat-form-title').textContent = 'Edit category';
        $('#cat-cancel').classList.remove('hidden');
        buildColorRow();
        $('#view-categories').scrollIntoView({ behavior: 'smooth' });
      }
    }
    if (cDel) {
      const cat = state.categories.find((c) => c.id === cDel.dataset.catDel);
      if (!cat) return;
      if (cat.txCount > 0) {
        toast(`Cannot delete — ${cat.txCount} transactions use it`, 'error');
        return;
      }
      confirmAction('Delete category?', `"${cat.name}" will be removed.`, 'Delete', async () => {
        try {
          await api('/categories/' + cat.id, { method: 'DELETE' });
          toast('Category deleted');
          await refreshCategories();
          renderCategories();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  });

  /* settings */
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.settings = await api('/settings', {
        method: 'PUT',
        body: { name: $('#s-name').value, currency: $('#s-currency').value }
      });
      $('#brand-name').textContent = state.settings.name;
      toast('Preferences saved');
      const stats = await api('/stats');
      $('#sidebar-balance').textContent = currency(stats.balance);
      render();
    } catch (err) { toast(err.message, 'error'); }
  });

  $('#s-theme').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-theme-val]');
    if (!btn) return;
    applyTheme(btn.dataset.themeVal);
    state.settings = await api('/settings', { method: 'PUT', body: { theme: btn.dataset.themeVal } });
    $$('#s-theme button').forEach((b) => b.classList.toggle('active', b === btn));
    toast('Theme updated');
  });

  $('#csv-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await api('/import/csv', { method: 'POST', body: { csv: text } });
      toast(`Imported ${result.imported} transactions`);
      if (result.errors.length) toast(`${result.errors.length} rows skipped`, 'error');
      await refreshCategories();
      const stats = await api('/stats');
      $('#sidebar-balance').textContent = currency(stats.balance);
      renderSettings();
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  $('#backup-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await api('/import/backup', { method: 'POST', body: parsed });
      toast('Backup restored');
      state.settings = await api('/settings');
      applyTheme(state.settings.theme);
      $('#brand-name').textContent = state.settings.name;
      await refreshCategories();
      const stats = await api('/stats');
      $('#sidebar-balance').textContent = currency(stats.balance);
      renderSettings();
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  $('#reset-btn').addEventListener('click', () => {
    confirmAction('Reset all data?', 'Every transaction, budget, goal and category will be deleted. This cannot be undone.', 'Reset everything', async () => {
      try {
        await api('/reset', { method: 'POST', body: { mode: 'all' } });
        toast('All data reset');
        state.settings = await api('/settings');
        await refreshCategories();
        const stats = await api('/stats');
        $('#sidebar-balance').textContent = currency(stats.balance);
        renderSettings();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  $('#sample-btn').addEventListener('click', () => {
    confirmAction('Load sample data?', 'Current data will be replaced with the demo dataset.', 'Load sample data', async () => {
      try {
        await api('/reset', { method: 'POST', body: { mode: 'sample' } });
        toast('Sample data loaded');
        state.settings = await api('/settings');
        $('#brand-name').textContent = state.settings.name;
        await refreshCategories();
        const stats = await api('/stats');
        $('#sidebar-balance').textContent = currency(stats.balance);
        renderSettings();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  /* confirm modal */
  $('#confirm-yes').addEventListener('click', async () => {
    const fn = state.pendingConfirm;
    state.pendingConfirm = null;
    closeModal('#confirm-modal');
    if (fn) await fn();
  });
}

function shiftMonth(delta) {
  const [y, m] = state.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  $('#month-label').textContent = monthName(state.month);
  render();
}

init().catch((err) => toast(err.message, 'error'));
