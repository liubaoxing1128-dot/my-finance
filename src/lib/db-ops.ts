/**
 * 客户端数据操作层
 * 替代所有 /api/* 路由，直接操作浏览器 SQLite
 * 基金搜索/净值刷新除外（仍需走网络）
 */
import { getClientDb, queryAll, queryOne, execRun, markDirty } from './client-db';
import type { Database } from 'sql.js';

// ========== 辅助 ==========
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const run = (sql: string, params: unknown[] = []) => {
  getClientDb().run(sql, params as (string | number | null)[]);
};

// 交易日后推
function nextTradingDay(date: Date, offset: number): string {
  const d = new Date(date);
  let added = 0;
  while (added < offset) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

// ========== 仪表盘 ==========
export function getDashboard() {
  const db = getClientDb();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const balance = queryOne(db, 'SELECT COALESCE(SUM(balance),0) as total FROM accounts WHERE is_active=1') as { total: number };
  const income = queryOne(db, "SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='income' AND strftime('%Y-%m', date)=?", [currentMonth]) as { total: number };
  const expense = queryOne(db, "SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' AND strftime('%Y-%m', date)=?", [currentMonth]) as { total: number };
  const savings = queryOne(db, "SELECT COALESCE(AVG(current_amount*100.0/NULLIF(target_amount,0)),0) as pct FROM savings_goals WHERE status='active'") as { pct: number };
  const budget = queryOne(db, 'SELECT COALESCE(AVG(spent*100.0/NULLIF(amount,0)),0) as pct FROM budgets WHERE month=?', [currentMonth]) as { pct: number };

  return {
    total_balance: balance.total, monthly_income: income.total, monthly_expense: expense.total,
    monthly_balance: income.total - expense.total,
    savings_progress: Math.round(savings.pct), budget_usage: Math.round(budget.pct),
  };
}

export function getMonthlyTrends() {
  return queryAll(getClientDb(), `
    SELECT strftime('%Y-%m', date) as month,
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
    FROM transactions WHERE date >= date('now','-6 months')
    GROUP BY strftime('%Y-%m', date) ORDER BY month
  `);
}

export function getCategorySpendings() {
  const m = new Date().toISOString().slice(0, 7);
  return queryAll(getClientDb(), `
    SELECT c.name, COALESCE(SUM(t.amount),0) as amount, c.color
    FROM categories c LEFT JOIN transactions t ON t.category_id=c.id AND t.type='expense' AND strftime('%Y-%m', t.date)=?
    WHERE c.type='expense' GROUP BY c.id HAVING amount>0 ORDER BY amount DESC
  `, [m]);
}

// ========== 账户 ==========
export function getAccounts() {
  return queryAll(getClientDb(), 'SELECT * FROM accounts WHERE is_active=1 ORDER BY created_at DESC');
}
export function createAccount(data: Record<string, unknown>) {
  execRun(getClientDb(), 'INSERT INTO accounts (name, type, balance, currency, icon, color) VALUES (?,?,?,?,?,?)',
    [data.name, data.type, data.balance ?? 0, data.currency ?? 'CNY', data.icon ?? 'wallet', data.color ?? '#3b82f6']);
  markDirty();
}
export function updateAccount(id: number, data: Record<string, unknown>) {
  execRun(getClientDb(),
    "UPDATE accounts SET name=?, type=?, balance=?, currency=?, icon=?, color=?, updated_at=datetime('now','localtime') WHERE id=?",
    [data.name, data.type, data.balance, data.currency ?? 'CNY', data.icon, data.color, id]);
  markDirty();
}
export function deleteAccount(id: number) {
  execRun(getClientDb(), "UPDATE accounts SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?", [id]);
  markDirty();
}

// ========== 分类 ==========
export function getCategories() {
  return queryAll(getClientDb(), 'SELECT * FROM categories ORDER BY type, id');
}
export function createCategory(data: Record<string, unknown>) {
  execRun(getClientDb(), 'INSERT INTO categories (name, type, icon, color) VALUES (?,?,?,?)',
    [data.name, data.type, data.icon ?? 'tag', data.color ?? '#6b7280']);
  markDirty();
}
export function updateCategory(id: number, data: Record<string, unknown>) {
  execRun(getClientDb(), 'UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=?',
    [data.name, data.type, data.icon, data.color, id]);
  markDirty();
}
export function deleteCategory(id: number) {
  const db = getClientDb();
  run('UPDATE transactions SET category_id=NULL WHERE category_id=?', [id]);
  run('DELETE FROM budgets WHERE category_id=?', [id]);
  run('DELETE FROM categories WHERE id=?', [id]);
  markDirty();
}

// ========== 交易 ==========
export function getTransactions(month?: string, limit = 50) {
  let sql = `SELECT t.*, a.name as account_name, a.icon as account_icon, a.color as account_color,
    ta.name as to_account_name, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM transactions t JOIN accounts a ON t.account_id=a.id
    LEFT JOIN accounts ta ON t.to_account_id=ta.id LEFT JOIN categories c ON t.category_id=c.id`;
  const params: (string | number)[] = [];
  if (month) { sql += " WHERE strftime('%Y-%m', t.date)=?"; params.push(month); }
  sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ?'; params.push(limit);
  return queryAll(getClientDb(), sql, params);
}
export function createTransaction(data: Record<string, unknown>) {
  const db = getClientDb();
  const { type, amount, description, date, account_id, to_account_id, category_id } = data as any;
  const amt = Number(amount);
  const aid = Number(account_id);
  const tid = to_account_id ? Number(to_account_id) : null;
  const cid = category_id ? Number(category_id) : null;

  run('INSERT INTO transactions (type,amount,description,date,account_id,to_account_id,category_id) VALUES (?,?,?,?,?,?,?)',
    [type, amt, description || null, date, aid, tid, cid]);

  if (type === 'transfer' && tid) {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amt, tid]);
  } else if (type === 'expense') {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
  } else {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
  }

  if (type === 'expense' && cid) {
    const txMonth = (date as string).substring(0, 7);
    run('UPDATE budgets SET spent=spent+? WHERE category_id=? AND month=?', [amt, cid, txMonth]);
  }
  markDirty();
}
export function updateTransaction(id: number, data: Record<string, unknown>) {
  const db = getClientDb();
  const old = queryOne(db, 'SELECT * FROM transactions WHERE id=?', [id]) as Record<string, unknown> | null;
  if (!old) return;

  // 撤销旧变动
  const oldAmt = Number(old.amount);
  const oldAid = Number(old.account_id);
  const oldTid = old.to_account_id ? Number(old.to_account_id) : null;
  const oldCid = old.category_id ? Number(old.category_id) : null;

  if (old.type === 'transfer' && oldTid) {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [oldAmt, oldAid]);
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [oldAmt, oldTid]);
  } else if (old.type === 'expense') {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [oldAmt, oldAid]);
  } else if (old.type === 'income') {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [oldAmt, oldAid]);
  }
  if (old.type === 'expense' && oldCid) {
    const om = (old.date as string).substring(0, 7);
    run('UPDATE budgets SET spent=MAX(0,spent-?) WHERE category_id=? AND month=?', [oldAmt, oldCid, om]);
  }

  // 更新
  const type = (data.type ?? old.type) as string;
  const amount = data.amount != null ? Number(data.amount) : oldAmt;
  const date = (data.date ?? old.date) as string;
  const aid = data.account_id != null ? Number(data.account_id) : oldAid;
  const tid = data.to_account_id !== undefined ? (data.to_account_id ? Number(data.to_account_id) : null) : oldTid;
  const cid = data.category_id !== undefined ? (data.category_id ? Number(data.category_id) : null) : oldCid;

  run('UPDATE transactions SET type=?,amount=?,description=?,date=?,account_id=?,to_account_id=?,category_id=? WHERE id=?',
    [type, amount, data.description ?? old.description, date, aid, tid, cid, id]);

  // 应用新变动
  if (type === 'transfer' && tid) {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amount, aid]);
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amount, tid]);
  } else if (type === 'expense') {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amount, aid]);
  } else if (type === 'income') {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amount, aid]);
  }
  if (type === 'expense' && cid) {
    const nm = date.substring(0, 7);
    run('UPDATE budgets SET spent=spent+? WHERE category_id=? AND month=?', [amount, cid, nm]);
  }
  markDirty();
}
export function deleteTransaction(id: number) {
  const db = getClientDb();
  const txn = queryOne(db, 'SELECT * FROM transactions WHERE id=?', [id]) as Record<string, unknown> | null;
  if (!txn) return;
  const amt = Number(txn.amount);
  const aid = Number(txn.account_id);
  const tid = txn.to_account_id ? Number(txn.to_account_id) : null;
  const cid = txn.category_id ? Number(txn.category_id) : null;

  if (txn.type === 'transfer' && tid) {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amt, tid]);
  } else if (txn.type === 'expense') {
    run("UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
  } else {
    run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amt, aid]);
  }
  if (txn.type === 'expense' && cid) {
    const om = (txn.date as string).substring(0, 7);
    run('UPDATE budgets SET spent=MAX(0,spent-?) WHERE category_id=? AND month=?', [amt, cid, om]);
  }
  run('DELETE FROM transactions WHERE id=?', [id]);
  markDirty();
}

// ========== 储蓄 ==========
export function getSavingsGoals() {
  return queryAll(getClientDb(), "SELECT * FROM savings_goals WHERE status!='cancelled' ORDER BY created_at DESC");
}
export function createSavingsGoal(data: Record<string, unknown>) {
  execRun(getClientDb(), 'INSERT INTO savings_goals (name,target_amount,deadline,icon,color) VALUES (?,?,?,?,?)',
    [data.name, data.target_amount, data.deadline || null, data.icon ?? 'target', data.color ?? '#10b981']);
  markDirty();
}
export function updateSavingsGoal(id: number, data: Record<string, unknown>) {
  const db = getClientDb();
  const old = queryOne(db, 'SELECT * FROM savings_goals WHERE id=?', [id]);
  execRun(db,
    "UPDATE savings_goals SET name=?,target_amount=?,deadline=?,icon=?,color=?,status=?,updated_at=datetime('now','localtime') WHERE id=?",
    [data.name ?? (old as any)?.name, data.target_amount ?? (old as any)?.target_amount, data.deadline ?? (old as any)?.deadline, data.icon ?? (old as any)?.icon, data.color ?? (old as any)?.color, data.status ?? (old as any)?.status, id]);
  markDirty();
}
export function deleteSavingsGoal(id: number) {
  const db = getClientDb();
  run('DELETE FROM savings_deposits WHERE goal_id=?', [id]);
  run('DELETE FROM savings_goals WHERE id=?', [id]);
  markDirty();
}
export function depositSavings(goalId: number, amount: number, date: string) {
  const db = getClientDb();
  run('INSERT INTO savings_deposits (goal_id,amount,date) VALUES (?,?,?)', [goalId, amount, date]);
  const goal = queryOne(db, 'SELECT * FROM savings_goals WHERE id=?', [goalId]) as Record<string, unknown>;
  const newCurrent = Number(goal.current_amount) + amount;
  const newStatus = newCurrent >= Number(goal.target_amount) ? 'completed' : 'active';
  run("UPDATE savings_goals SET current_amount=?,status=?,updated_at=datetime('now','localtime') WHERE id=?", [newCurrent, newStatus, goalId]);
  markDirty();
}

// ========== 预算 ==========
export function getBudgets(month: string) {
  return queryAll(getClientDb(), `
    SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM budgets b JOIN categories c ON b.category_id=c.id WHERE b.month=? ORDER BY b.id
  `, [month]);
}
export function setBudget(data: Record<string, unknown>) {
  const db = getClientDb();
  const { category_id, amount, month } = data as any;
  const spent = queryOne(db, "SELECT COALESCE(SUM(t.amount),0) as total FROM transactions t WHERE t.category_id=? AND t.type='expense' AND strftime('%Y-%m', t.date)=?", [category_id, month]) as { total: number };
  run('INSERT INTO budgets (category_id,amount,month,spent) VALUES (?,?,?,?) ON CONFLICT(category_id,month) DO UPDATE SET amount=excluded.amount', [category_id, amount, month, spent.total]);
  markDirty();
}
export function deleteBudget(id: number) {
  execRun(getClientDb(), 'DELETE FROM budgets WHERE id=?', [id]);
  markDirty();
}

// ========== 基金 ==========
export function getAllFunds() {
  const db = getClientDb();
  const funds = queryAll(db, `
    SELECT f.*,
      COALESCE((SELECT SUM(shares-sold_shares) FROM fund_holdings h WHERE h.fund_code=f.code AND shares>sold_shares),0) as total_shares,
      COALESCE((SELECT SUM(amount*(1.0*(shares-sold_shares)/NULLIF(shares,0))) FROM fund_holdings h WHERE h.fund_code=f.code AND shares>sold_shares),0) as total_invested
    FROM funds f ORDER BY f.created_at DESC
  `);
  return funds;
}
export function addFund(code: string, name: string, type: string, settlement: number) {
  execRun(getClientDb(), 'INSERT OR IGNORE INTO funds (code,name,type,settlement) VALUES (?,?,?,?)', [code, name, type, settlement]);
  markDirty();
}
export function deleteFund(code: string) {
  const db = getClientDb();
  run('DELETE FROM fund_holdings WHERE fund_code=?', [code]);
  run('DELETE FROM fund_sells WHERE fund_code=?', [code]);
  run('DELETE FROM auto_invests WHERE fund_code=?', [code]);
  run('DELETE FROM funds WHERE code=?', [code]);
  markDirty();
}
export async function refreshFundNavs() {
  // 从客户端 DB 获取所有基金代码，传服务端批量刷新
  const localFunds = getAllFunds() as any[];
  const codes = localFunds.map((f: any) => f.code).join(',');
  if (!codes) return { success: true, data: { updated: 0 } };

  const r = await fetch(`/api/funds/refresh?codes=${encodeURIComponent(codes)}`);
  const data = await r.json();
  if (data.success && data.data.results) {
    // 直接把服务端返回的净值写入客户端 DB
    for (const item of data.data.results) {
      updateFundNav(item.code, item.nav, item.date);
    }
  }
  return data;
}
export function searchFunds(keyword: string) {
  return fetch(`/api/funds/search?keyword=${encodeURIComponent(keyword)}`).then(r => r.json());
}
export function updateFundNav(code: string, nav: number, navDate: string) {
  const db = getClientDb();
  run("UPDATE funds SET current_nav=?,nav_date=?,updated_at=datetime('now','localtime') WHERE code=?", [nav, navDate, code]);
  markDirty();
}
export function getFundHoldings(fundCode?: string) {
  let sql = `
    SELECT h.*, f.name as fund_name, f.type as fund_type, f.current_nav,
      ((h.shares-h.sold_shares)*f.current_nav) as market_value,
      ((h.shares-h.sold_shares)*f.current_nav-(h.amount*(h.shares-h.sold_shares)/NULLIF(h.shares,0))) as profit,
      CASE WHEN h.amount>0 AND h.shares>0 THEN ROUND(((h.shares-h.sold_shares)*f.current_nav-(h.amount*(h.shares-h.sold_shares)/h.shares))/(h.amount*(h.shares-h.sold_shares)/h.shares)*100,2) ELSE NULL END as profit_rate
    FROM fund_holdings h JOIN funds f ON h.fund_code=f.code WHERE h.shares>h.sold_shares
  `;
  const params: string[] = [];
  if (fundCode) { sql += ' AND h.fund_code=?'; params.push(fundCode); }
  sql += ' ORDER BY h.date DESC';
  return queryAll(getClientDb(), sql, params);
}
export function createFundHolding(data: Record<string, unknown>) {
  const db = getClientDb();
  const { fund_code, amount, nav_at_purchase, date, fee, trade_time } = data as any;
  const amt = Number(amount);
  const nav = Number(nav_at_purchase);
  const feeAmt = Number(fee) || 0;
  const shares = (amt - feeAmt) / nav;
  const fund = queryOne(db, 'SELECT settlement FROM funds WHERE code=?', [fund_code]) as Record<string, unknown> | undefined;
  const settlementDays = (fund?.settlement as number) || 1;
  const tradeDt = trade_time ? new Date(trade_time as string) : new Date((date as string) + 'T15:00:00');
  const settlementDate = nextTradingDay(tradeDt, settlementDays);

  run('INSERT INTO fund_holdings (fund_code,amount,nav_at_purchase,shares,fee,trade_time,settlement_date,date,note) VALUES (?,?,?,?,?,?,?,?,?)',
    [fund_code, amt, nav, shares, feeAmt, trade_time || (date + 'T15:00:00'), settlementDate, date, null]);
  markDirty();
  return { settlement_date: settlementDate };
}
export function deleteFundHolding(id: number) {
  execRun(getClientDb(), 'DELETE FROM fund_holdings WHERE id=?', [id]);
  markDirty();
}
export function sellFund(data: Record<string, unknown>) {
  const db = getClientDb();
  const { fund_code, shares, nav_at_sell, fee, date, note } = data as any;
  const sellShares = Number(shares);
  const nav = Number(nav_at_sell);
  const feeAmt = Number(fee) || 0;
  const amount = sellShares * nav - feeAmt;

  // FIFO 扣减
  let remaining = sellShares;
  const holdings = queryAll(db, 'SELECT * FROM fund_holdings WHERE fund_code=? AND sold_shares<shares ORDER BY date ASC', [fund_code]) as Record<string, unknown>[];
  for (const h of holdings) {
    if (remaining <= 0) break;
    const avail = Number(h.shares) - Number(h.sold_shares);
    const deduct = Math.min(avail, remaining);
    run('UPDATE fund_holdings SET sold_shares=sold_shares+? WHERE id=?', [deduct, h.id]);
    remaining -= deduct;
  }

  run('INSERT INTO fund_sells (fund_code,shares,nav_at_sell,amount,fee,date,note) VALUES (?,?,?,?,?,?,?)',
    [fund_code, sellShares, nav, amount, feeAmt, date, note || null]);
  markDirty();
}

// ========== 定投 ==========
export function getAutoInvests() {
  return queryAll(getClientDb(), `
    SELECT a.*, f.name as fund_name, f.type as fund_type, f.current_nav, ac.name as account_name
    FROM auto_invests a JOIN funds f ON a.fund_code=f.code JOIN accounts ac ON a.account_id=ac.id
    ORDER BY a.status, a.next_date
  `);
}
export function createAutoInvest(data: Record<string, unknown>) {
  execRun(getClientDb(),
    'INSERT INTO auto_invests (fund_code,amount,frequency,account_id,next_date,status) VALUES (?,?,?,?,?,?)',
    [data.fund_code, data.amount, data.frequency, data.account_id, data.next_date, 'active']);
  markDirty();
}
export function executeAutoInvest(id: number) {
  const db = getClientDb();
  const plan = queryOne(db, `
    SELECT a.*, f.current_nav, f.settlement FROM auto_invests a JOIN funds f ON a.fund_code=f.code WHERE a.id=?
  `, [id]) as Record<string, unknown> | null;
  if (!plan || !plan.current_nav) throw new Error('请先刷新净值');

  const amt = Number(plan.amount);
  const nav = Number(plan.current_nav);
  const shares = amt / nav;
  const today = new Date().toISOString().slice(0, 10);
  const settlementDate = nextTradingDay(new Date(), Number(plan.settlement));

  // 扣款
  run("UPDATE accounts SET balance=balance-?, updated_at=datetime('now','localtime') WHERE id=?", [amt, plan.account_id]);
  // 账本记录
  run("INSERT INTO transactions (type,amount,description,date,account_id,category_id) VALUES ('expense',?,?,?,?,NULL)",
    [amt, `定投: ${plan.fund_name}`, today, plan.account_id]);
  // 买入
  run('INSERT INTO fund_holdings (fund_code,amount,nav_at_purchase,shares,fee,trade_time,settlement_date,date,note) VALUES (?,?,?,?,?,?,?,?,?)',
    [plan.fund_code, amt, nav, shares, 0, new Date().toISOString().slice(0, 19), settlementDate, today, '定投买入']);
  // 下次日期
  const next = new Date(plan.next_date as string);
  const freq = plan.frequency as string;
  if (freq === 'weekly') next.setDate(next.getDate() + 7);
  else if (freq === 'biweekly') next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);
  run("UPDATE auto_invests SET next_date=?, updated_at=datetime('now','localtime') WHERE id=?", [next.toISOString().slice(0, 10), id]);
  markDirty();
  return { shares, nav, account_balance: null };
}
export function deleteAutoInvest(id: number) {
  execRun(getClientDb(), 'DELETE FROM auto_invests WHERE id=?', [id]);
  markDirty();
}

// ========== 备份 ==========
export function exportAllData() {
  const db = getClientDb();
  const tables = ['accounts', 'categories', 'transactions', 'savings_goals', 'savings_deposits', 'budgets', 'funds', 'fund_holdings', 'fund_sells', 'auto_invests'];
  const data: Record<string, unknown[]> = {};
  for (const t of tables) {
    data[t] = queryAll(db, `SELECT * FROM "${t}"`);
  }
  return { version: 1, exported_at: new Date().toISOString(), data };
}

export function importAllData(backup: { version: number; data: Record<string, unknown[]> }) {
  const db = getClientDb();
  const tables = ['auto_invests', 'fund_sells', 'fund_holdings', 'funds', 'budgets', 'savings_deposits', 'savings_goals', 'transactions', 'categories', 'accounts'];
  for (const table of tables) {
    const rows = backup.data[table];
    if (!rows?.length) continue;
    const cols = Object.keys(rows[0] as Record<string, unknown>);
    run(`DELETE FROM "${table}"`);
    const stmt = db.prepare(`INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const row of rows) {
      stmt.run(cols.map(c => (row as Record<string, unknown>)[c] as (string | number | null)));
    }
    stmt.free();
  }
  markDirty();
}
