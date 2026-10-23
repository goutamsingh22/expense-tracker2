const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const monthOf = (dateStr) => String(dateStr).slice(0, 7);

const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', color: '#22c55e', icon: 'briefcase' },
  { name: 'Freelance', type: 'income', color: '#10b981', icon: 'laptop' },
  { name: 'Investments', type: 'income', color: '#14b8a6', icon: 'trending-up' },
  { name: 'Other Income', type: 'income', color: '#84cc16', icon: 'plus-circle' },
  { name: 'Housing', type: 'expense', color: '#6366f1', icon: 'home' },
  { name: 'Food & Dining', type: 'expense', color: '#f97316', icon: 'utensils' },
  { name: 'Groceries', type: 'expense', color: '#f59e0b', icon: 'shopping-cart' },
  { name: 'Transport', type: 'expense', color: '#06b6d4', icon: 'car' },
  { name: 'Utilities', type: 'expense', color: '#0ea5e9', icon: 'zap' },
  { name: 'Health', type: 'expense', color: '#ec4899', icon: 'heart' },
  { name: 'Shopping', type: 'expense', color: '#a855f7', icon: 'bag' },
  { name: 'Entertainment', type: 'expense', color: '#ef4444', icon: 'film' },
  { name: 'Education', type: 'expense', color: '#3b82f6', icon: 'book' },
  { name: 'Subscriptions', type: 'expense', color: '#8b5cf6', icon: 'repeat' },
  { name: 'Travel', type: 'expense', color: '#f43f5e', icon: 'plane' },
  { name: 'Other Expense', type: 'expense', color: '#64748b', icon: 'more-horizontal' }
];

function defaultDB() {
  return {
    settings: {
      name: 'My Budget',
      currency: 'INR',
      theme: 'dark',
      monthStartDay: 1
    },
    categories: [],
    transactions: [],
    budgets: [],
    goals: []
  };
}

let db = defaultDB();

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      db = Object.assign(defaultDB(), JSON.parse(raw));
    } else {
      seed();
      persist(true);
    }
  } catch (err) {
    console.error('Failed to load DB, using defaults:', err.message);
    seed();
  }
  if (!db.categories.length) seedCategories();
}

let saveTimer = null;
function persist(immediate = false) {
  const write = () => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_PATH);
    } catch (err) {
      console.error('Failed to persist DB:', err.message);
    }
  };
  clearTimeout(saveTimer);
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

function seedCategories() {
  db.categories = DEFAULT_CATEGORIES.map((c) => ({ id: uid(), ...c, builtin: true }));
}

function seed() {
  seedCategories();
  const cat = (name) => db.categories.find((c) => c.name === name);
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const tx = (name, type, amount, catName, offset, note = '') => ({
    id: uid(),
    type,
    amount,
    categoryId: cat(catName).id,
    date: day(offset),
    note,
    paymentMethod: 'card',
    createdAt: nowISO()
  });

  db.transactions = [
    tx('Monthly salary', 'income', 5200, 'Salary', 3, 'Acme Corp'),
    tx('Salary last month', 'income', 5200, 'Salary', 33),
    tx('Logo design', 'income', 650, 'Freelance', 8, 'Client: Nova'),
    tx('Dividends', 'income', 120.5, 'Investments', 14),
    tx('Apartment rent', 'expense', 1450, 'Housing', 2),
    tx('Rent last month', 'expense', 1450, 'Housing', 32),
    tx('Electric bill', 'expense', 84.2, 'Utilities', 5),
    tx('Internet', 'expense', 59.99, 'Utilities', 6),
    tx('Phone plan', 'expense', 35, 'Utilities', 12),
    tx('Weekly groceries', 'expense', 112.4, 'Groceries', 3),
    tx('Groceries run', 'expense', 96.75, 'Groceries', 10),
    tx('Farmers market', 'expense', 42.3, 'Groceries', 17),
    tx('Dinner out', 'expense', 68.5, 'Food & Dining', 1),
    tx('Coffee', 'expense', 5.75, 'Food & Dining', 0, 'Latte'),
    tx('Pizza night', 'expense', 31.2, 'Food & Dining', 7),
    tx('Lunch', 'expense', 14.8, 'Food & Dining', 4),
    tx('Gas', 'expense', 48.6, 'Transport', 9),
    tx('Metro card', 'expense', 30, 'Transport', 15),
    tx('Ride share', 'expense', 18.4, 'Transport', 6),
    tx('Gym membership', 'expense', 45, 'Health', 11),
    tx('Pharmacy', 'expense', 22.15, 'Health', 13),
    tx('Running shoes', 'expense', 119.99, 'Shopping', 16),
    tx('New headphones', 'expense', 199.99, 'Shopping', 20),
    tx('Netflix', 'expense', 15.49, 'Subscriptions', 18),
    tx('Music streaming', 'expense', 10.99, 'Subscriptions', 18),
    tx('Cloud storage', 'expense', 9.99, 'Subscriptions', 19),
    tx('Cinema tickets', 'expense', 26, 'Entertainment', 5),
    tx('Concert', 'expense', 85, 'Entertainment', 22),
    tx('Online course', 'expense', 49.99, 'Education', 21),
    tx('Weekend trip', 'expense', 320, 'Travel', 25),
    tx('Salary (prev month 2)', 'income', 5100, 'Salary', 63),
    tx('Rent (prev month 2)', 'expense', 1450, 'Housing', 62),
    tx('Groceries (prev month 2)', 'expense', 210.3, 'Groceries', 55),
    tx('Dining (prev month 2)', 'expense', 145.6, 'Food & Dining', 58),
    tx('Utilities (prev month 2)', 'expense', 142.5, 'Utilities', 60),
    tx('Shopping (prev month 2)', 'expense', 89.9, 'Shopping', 57),
    tx('Salary (prev month 3)', 'income', 5100, 'Salary', 93),
    tx('Rent (prev month 3)', 'expense', 1450, 'Housing', 92),
    tx('Groceries (prev month 3)', 'expense', 198.7, 'Groceries', 85),
    tx('Dining (prev month 3)', 'expense', 172.4, 'Food & Dining', 88),
    tx('Transport (prev month 3)', 'expense', 96.2, 'Transport', 86),
    tx('Entertainment (prev month 3)', 'expense', 64, 'Entertainment', 90)
  ];

  db.budgets = [
    { id: uid(), categoryId: cat('Groceries').id, amount: 400 },
    { id: uid(), categoryId: cat('Food & Dining').id, amount: 300 },
    { id: uid(), categoryId: cat('Transport').id, amount: 150 },
    { id: uid(), categoryId: cat('Entertainment').id, amount: 150 },
    { id: uid(), categoryId: cat('Shopping').id, amount: 250 },
    { id: uid(), categoryId: cat('Utilities').id, amount: 200 },
    { id: uid(), categoryId: cat('Subscriptions').id, amount: 60 }
  ];

  db.goals = [
    { id: uid(), name: 'Emergency Fund', target: 10000, deadline: '', contributions: [
      { id: uid(), amount: 500, date: day(40) },
      { id: uid(), amount: 350, date: day(12) }
    ] },
    { id: uid(), name: 'New Laptop', target: 1800, deadline: day(-90), contributions: [
      { id: uid(), amount: 600, date: day(28) }
    ] }
  ];
}

loadDB();

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function validAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 99999999;
}

function validDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v));
}

function categoryById(id) {
  return db.categories.find((c) => c.id === id);
}

function sanitizeCategoryInput(body, existing = {}) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Category name is required' };
  if (name.length > 40) return { error: 'Category name too long' };
  const type = body.type || existing.type;
  if (type !== 'income' && type !== 'expense') return { error: 'Type must be income or expense' };
  const dup = db.categories.find(
    (c) => c.id !== existing.id && c.type === type && c.name.toLowerCase() === name.toLowerCase()
  );
  if (dup) return { error: 'Category already exists' };
  return {
    value: {
      name,
      type,
      color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : existing.color || '#6366f1',
      icon: String(body.icon || existing.icon || 'tag').slice(0, 30)
    }
  };
}

function monthInRange(month, txMonth) {
  return !month || txMonth === month;
}

function computeSummary(month) {
  const txs = db.transactions.filter((t) => monthInRange(month, monthOf(t.date)));
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const catTotals = {};
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount;
  }

  const budgets = db.budgets.map((b) => {
    const cat = categoryById(b.categoryId);
    const spent = cat ? catTotals[b.categoryId] || 0 : 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: cat ? cat.name : 'Unknown',
      color: cat ? cat.color : '#64748b',
      limit: b.amount,
      spent: Math.round(spent * 100) / 100,
      remaining: Math.round((b.amount - spent) * 100) / 100,
      pct,
      status: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok'
    };
  });

  const topExpenses = [...txs]
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => ({ ...t, categoryName: categoryById(t.categoryId)?.name || 'Unknown' }));

  const recent = [...db.transactions]
    .sort((a, b) => (a.date < b.date ? 1 : -1) || (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8)
    .map((t) => ({ ...t, categoryName: categoryById(t.categoryId)?.name || 'Unknown', categoryColor: categoryById(t.categoryId)?.color || '#64748b' }));

  const goals = db.goals.map((g) => {
    const saved = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
    return {
      id: g.id,
      name: g.name,
      target: g.target,
      saved: Math.round(saved * 100) / 100,
      pct: g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0,
      deadline: g.deadline
    };
  });

  return {
    month: month || new Date().toISOString().slice(0, 7),
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
    budgets,
    topExpenses,
    recent,
    goals
  };
}

function computeTrends(months = 6) {
  const result = [];
  const d = new Date();
  d.setDate(1);
  for (let i = months - 1; i >= 0; i--) {
    const cur = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    const txs = db.transactions.filter((t) => monthOf(t.date) === key);
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    result.push({
      month: key,
      label: cur.toLocaleString('en-US', { month: 'short' }),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net: Math.round((income - expense) * 100) / 100
    });
  }
  return result;
}

function computeCategoryBreakdown(month, type = 'expense') {
  const txs = db.transactions.filter((t) => t.type === type && monthInRange(month, monthOf(t.date)));
  const map = {};
  for (const t of txs) map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
  const total = txs.reduce((s, t) => s + t.amount, 0);
  return Object.entries(map)
    .map(([categoryId, amount]) => {
      const cat = categoryById(categoryId);
      return {
        categoryId,
        name: cat ? cat.name : 'Unknown',
        color: cat ? cat.color : '#64748b',
        amount: Math.round(amount * 100) / 100,
        pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function computeDailySpending(month) {
  const prefix = month || new Date().toISOString().slice(0, 7);
  const [y, m] = prefix.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    date: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    expense: 0,
    income: 0
  }));
  for (const t of db.transactions) {
    if (monthOf(t.date) !== prefix) continue;
    const dayNum = Number(t.date.slice(8, 10));
    const slot = days[dayNum - 1];
    if (slot) slot[t.type] = Math.round((slot[t.type] + t.amount) * 100) / 100;
  }
  return days;
}

function toCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(',')
    )
    .join('\n');
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/settings', (req, res) => res.json(db.settings));

app.put('/api/settings', (req, res) => {
  const { name, currency, theme, monthStartDay } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n > 50) return fail(res, 400, 'Invalid name');
    db.settings.name = n;
  }
  if (currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(currency)) return fail(res, 400, 'Currency must be a 3-letter code');
    db.settings.currency = currency;
  }
  if (theme !== undefined) {
    if (!['dark', 'light'].includes(theme)) return fail(res, 400, 'Theme must be dark or light');
    db.settings.theme = theme;
  }
  if (monthStartDay !== undefined) {
    const d = Number(monthStartDay);
    if (!Number.isInteger(d) || d < 1 || d > 28) return fail(res, 400, 'monthStartDay must be 1-28');
    db.settings.monthStartDay = d;
  }
  persist();
  res.json(db.settings);
});

app.get('/api/categories', (req, res) => {
  const { type } = req.query;
  let list = db.categories;
  if (type) list = list.filter((c) => c.type === type);
  const used = {};
  for (const t of db.transactions) used[t.categoryId] = (used[t.categoryId] || 0) + 1;
  res.json(list.map((c) => ({ ...c, txCount: used[c.id] || 0 })));
});

app.post('/api/categories', (req, res) => {
  const out = sanitizeCategoryInput(req.body || {});
  if (out.error) return fail(res, 400, out.error);
  const cat = { id: uid(), ...out.value, builtin: false };
  db.categories.push(cat);
  persist();
  res.status(201).json(cat);
});

app.put('/api/categories/:id', (req, res) => {
  const cat = categoryById(req.params.id);
  if (!cat) return fail(res, 404, 'Category not found');
  const out = sanitizeCategoryInput(req.body || {}, cat);
  if (out.error) return fail(res, 400, out.error);
  Object.assign(cat, out.value);
  persist();
  res.json(cat);
});

app.delete('/api/categories/:id', (req, res) => {
  const cat = categoryById(req.params.id);
  if (!cat) return fail(res, 404, 'Category not found');
  const used = db.transactions.some((t) => t.categoryId === cat.id);
  if (used) return fail(res, 409, 'Category has transactions. Move or delete them first.');
  db.categories = db.categories.filter((c) => c.id !== cat.id);
  db.budgets = db.budgets.filter((b) => b.categoryId !== cat.id);
  persist();
  res.json({ ok: true });
});

app.get('/api/transactions', (req, res) => {
  const { type, category, from, to, q, min, max, sort = 'date', order = 'desc', page = 1, limit = 20 } = req.query;
  let list = [...db.transactions];

  if (type === 'income' || type === 'expense') list = list.filter((t) => t.type === type);
  if (category) list = list.filter((t) => t.categoryId === category);
  if (from) list = list.filter((t) => t.date >= from);
  if (to) list = list.filter((t) => t.date <= to);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((t) => {
      const cat = categoryById(t.categoryId);
      return (
        String(t.note || '').toLowerCase().includes(needle) ||
        (cat && cat.name.toLowerCase().includes(needle)) ||
        String(t.amount).includes(needle)
      );
    });
  }
  if (min !== undefined && min !== '') list = list.filter((t) => t.amount >= Number(min));
  if (max !== undefined && max !== '') list = list.filter((t) => t.amount <= Number(max));

  const dir = order === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let av, bv;
    if (sort === 'amount') { av = a.amount; bv = b.amount; }
    else if (sort === 'category') {
      av = (categoryById(a.categoryId)?.name || '').toLowerCase();
      bv = (categoryById(b.categoryId)?.name || '').toLowerCase();
    } else { av = a.date + (a.createdAt || ''); bv = b.date + (b.createdAt || ''); }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / Number(limit)));
  const p = Math.min(Math.max(1, Number(page)), totalPages);
  const lim = Math.min(Math.max(1, Number(limit)), 100);
  const start = (p - 1) * lim;

  const items = list.slice(start, start + lim).map((t) => {
    const cat = categoryById(t.categoryId);
    return { ...t, categoryName: cat?.name || 'Unknown', categoryColor: cat?.color || '#64748b', categoryIcon: cat?.icon || 'tag' };
  });

  const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  res.json({
    items,
    total,
    page: p,
    totalPages,
    summary: {
      count: total,
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100
    }
  });
});

function txInput(body, existing = {}) {
  const type = body.type || existing.type;
  if (type !== 'income' && type !== 'expense') return { error: 'Type must be income or expense' };
  if (!validAmount(body.amount)) return { error: 'Amount must be a positive number' };
  if (!validDate(body.date)) return { error: 'Date must be YYYY-MM-DD' };
  const cat = categoryById(body.categoryId || existing.categoryId);
  if (!cat) return { error: 'Valid category is required' };
  if (cat.type !== type) return { error: 'Category type does not match transaction type' };
  return {
    value: {
      type,
      amount: Math.round(Number(body.amount) * 100) / 100,
      categoryId: cat.id,
      date: body.date,
      note: String(body.note || '').slice(0, 200),
      paymentMethod: String(body.paymentMethod || existing.paymentMethod || 'card').slice(0, 30)
    }
  };
}

app.post('/api/transactions', (req, res) => {
  const out = txInput(req.body || {});
  if (out.error) return fail(res, 400, out.error);
  const tx = { id: uid(), ...out.value, createdAt: nowISO() };
  db.transactions.push(tx);
  persist();
  res.status(201).json(tx);
});

app.get('/api/transactions/:id', (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx) return fail(res, 404, 'Transaction not found');
  const cat = categoryById(tx.categoryId);
  res.json({ ...tx, categoryName: cat?.name || 'Unknown', categoryColor: cat?.color || '#64748b' });
});

app.put('/api/transactions/:id', (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx) return fail(res, 404, 'Transaction not found');
  const out = txInput(req.body || {}, tx);
  if (out.error) return fail(res, 400, out.error);
  Object.assign(tx, out.value, { updatedAt: nowISO() });
  persist();
  res.json(tx);
});

app.delete('/api/transactions/:id', (req, res) => {
  const before = db.transactions.length;
  db.transactions = db.transactions.filter((t) => t.id !== req.params.id);
  if (db.transactions.length === before) return fail(res, 404, 'Transaction not found');
  persist();
  res.json({ ok: true });
});

app.get('/api/budgets', (req, res) => res.json(db.budgets));

app.post('/api/budgets', (req, res) => {
  const { categoryId, amount, id } = req.body || {};
  const cat = categoryById(categoryId);
  if (!cat) return fail(res, 400, 'Valid category is required');
  if (cat.type !== 'expense') return fail(res, 400, 'Budgets are for expense categories');
  if (!validAmount(amount)) return fail(res, 400, 'Amount must be a positive number');
  const existing = db.budgets.find((b) => b.categoryId === categoryId);
  if (existing && !id) return fail(res, 409, 'Budget already exists for this category');
  if (id) {
    const b = db.budgets.find((x) => x.id === id);
    if (b) {
      b.amount = Math.round(Number(amount) * 100) / 100;
      persist();
      return res.json(b);
    }
  }
  const budget = { id: uid(), categoryId, amount: Math.round(Number(amount) * 100) / 100 };
  db.budgets.push(budget);
  persist();
  res.status(201).json(budget);
});

app.put('/api/budgets/:id', (req, res) => {
  const b = db.budgets.find((x) => x.id === req.params.id);
  if (!b) return fail(res, 404, 'Budget not found');
  if (!validAmount(req.body.amount)) return fail(res, 400, 'Amount must be a positive number');
  b.amount = Math.round(Number(req.body.amount) * 100) / 100;
  persist();
  res.json(b);
});

app.delete('/api/budgets/:id', (req, res) => {
  const before = db.budgets.length;
  db.budgets = db.budgets.filter((b) => b.id !== req.params.id);
  if (db.budgets.length === before) return fail(res, 404, 'Budget not found');
  persist();
  res.json({ ok: true });
});

app.get('/api/goals', (req, res) => {
  res.json(
    db.goals.map((g) => {
      const saved = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
      return { ...g, saved: Math.round(saved * 100) / 100 };
    })
  );
});

app.post('/api/goals', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 400, 'Goal name is required');
  if (name.length > 60) return fail(res, 400, 'Goal name too long');
  if (!validAmount(req.body.target)) return fail(res, 400, 'Target must be a positive number');
  const deadline = req.body.deadline || '';
  if (deadline && !validDate(deadline)) return fail(res, 400, 'Deadline must be YYYY-MM-DD');
  const goal = { id: uid(), name, target: Math.round(Number(req.body.target) * 100) / 100, deadline, contributions: [] };
  db.goals.push(goal);
  persist();
  res.status(201).json(goal);
});

app.put('/api/goals/:id', (req, res) => {
  const g = db.goals.find((x) => x.id === req.params.id);
  if (!g) return fail(res, 404, 'Goal not found');
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return fail(res, 400, 'Goal name is required');
    g.name = name;
  }
  if (req.body.target !== undefined) {
    if (!validAmount(req.body.target)) return fail(res, 400, 'Target must be a positive number');
    g.target = Math.round(Number(req.body.target) * 100) / 100;
  }
  if (req.body.deadline !== undefined) {
    const deadline = req.body.deadline || '';
    if (deadline && !validDate(deadline)) return fail(res, 400, 'Deadline must be YYYY-MM-DD');
    g.deadline = deadline;
  }
  persist();
  res.json(g);
});

app.delete('/api/goals/:id', (req, res) => {
  const before = db.goals.length;
  db.goals = db.goals.filter((g) => g.id !== req.params.id);
  if (db.goals.length === before) return fail(res, 404, 'Goal not found');
  persist();
  res.json({ ok: true });
});

app.post('/api/goals/:id/contributions', (req, res) => {
  const g = db.goals.find((x) => x.id === req.params.id);
  if (!g) return fail(res, 404, 'Goal not found');
  if (!validAmount(req.body.amount)) return fail(res, 400, 'Amount must be a positive number');
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) return fail(res, 400, 'Date must be YYYY-MM-DD');
  const contribution = { id: uid(), amount: Math.round(Number(req.body.amount) * 100) / 100, date };
  g.contributions = g.contributions || [];
  g.contributions.push(contribution);
  persist();
  res.status(201).json(contribution);
});

app.delete('/api/goals/:id/contributions/:cid', (req, res) => {
  const g = db.goals.find((x) => x.id === req.params.id);
  if (!g) return fail(res, 404, 'Goal not found');
  const before = (g.contributions || []).length;
  g.contributions = (g.contributions || []).filter((c) => c.id !== req.params.cid);
  if (g.contributions.length === before) return fail(res, 404, 'Contribution not found');
  persist();
  res.json({ ok: true });
});

app.get('/api/summary', (req, res) => res.json(computeSummary(req.query.month)));

app.get('/api/analytics/trends', (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  res.json(computeTrends(months));
});

app.get('/api/analytics/breakdown', (req, res) => {
  const { month, type } = req.query;
  res.json(computeCategoryBreakdown(month, type === 'income' ? 'income' : 'expense'));
});

app.get('/api/analytics/daily', (req, res) => res.json(computeDailySpending(req.query.month)));

app.get('/api/export/csv', (req, res) => {
  const rows = [['id', 'date', 'type', 'amount', 'category', 'note', 'paymentMethod']];
  for (const t of db.transactions) {
    rows.push([t.id, t.date, t.type, t.amount, categoryById(t.categoryId)?.name || '', t.note || '', t.paymentMethod || '']);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send('﻿' + toCSV(rows));
});

app.post('/api/import/csv', (req, res) => {
  const text = String(req.body.csv || '');
  if (!text.trim()) return fail(res, 400, 'No CSV provided');
  const rows = parseCSV(text);
  if (rows.length < 2) return fail(res, 400, 'CSV has no data rows');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = { date: col('date'), type: col('type'), amount: col('amount'), category: col('category'), note: col('note') };
  if (idx.date < 0 || idx.type < 0 || idx.amount < 0) {
    return fail(res, 400, 'CSV must have date, type, amount columns');
  }
  const imported = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const type = (r[idx.type] || '').trim().toLowerCase();
    const amount = Number(r[idx.amount]);
    const date = (r[idx.date] || '').trim();
    if (!['income', 'expense'].includes(type)) { errors.push(`Row ${i + 1}: bad type`); continue; }
    if (!validAmount(amount)) { errors.push(`Row ${i + 1}: bad amount`); continue; }
    if (!validDate(date)) { errors.push(`Row ${i + 1}: bad date`); continue; }
    const catName = idx.category >= 0 ? (r[idx.category] || '').trim() : '';
    let cat = db.categories.find((c) => c.type === type && c.name.toLowerCase() === catName.toLowerCase());
    if (!cat) {
      cat = db.categories.find((c) => c.type === type && c.name.startsWith('Other'));
    }
    if (!cat) {
      cat = { id: uid(), name: catName || 'Imported', type, color: '#64748b', icon: 'tag', builtin: false };
      db.categories.push(cat);
    }
    imported.push({
      id: uid(),
      type,
      amount: Math.round(amount * 100) / 100,
      categoryId: cat.id,
      date,
      note: idx.note >= 0 ? String(r[idx.note] || '').slice(0, 200) : '',
      paymentMethod: 'import',
      createdAt: nowISO()
    });
  }
  db.transactions.push(...imported);
  persist();
  res.json({ imported: imported.length, errors });
});

app.get('/api/export/backup', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="expense-tracker-backup.json"');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/import/backup', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') return fail(res, 400, 'Invalid backup');
  if (!Array.isArray(incoming.transactions) || !Array.isArray(incoming.categories)) {
    return fail(res, 400, 'Backup must contain transactions and categories arrays');
  }
  db = Object.assign(defaultDB(), incoming);
  if (!db.categories.length) seedCategories();
  persist(true);
  res.json({ ok: true, transactions: db.transactions.length });
});

app.post('/api/reset', (req, res) => {
  const { mode } = req.body || {};
  if (mode === 'transactions') db.transactions = [];
  else if (mode === 'sample') { db = defaultDB(); seed(); }
  else db = defaultDB();
  persist(true);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const all = db.transactions;
  const income = all.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = all.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const months = new Set(all.map((t) => monthOf(t.date)));
  res.json({
    transactions: all.length,
    categories: db.categories.length,
    budgets: db.budgets.length,
    goals: db.goals.length,
    totalIncome: Math.round(income * 100) / 100,
    totalExpense: Math.round(expense * 100) / 100,
    balance: Math.round((income - expense) * 100) / 100,
    monthsTracked: months.size
  });
});

app.use('/api', (req, res) => fail(res, 404, 'Not found'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  Expense Tracker running at http://localhost:${PORT}\n`);
});
