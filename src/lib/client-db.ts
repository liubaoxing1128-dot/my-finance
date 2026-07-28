/**
 * 浏览器端 SQLite（sql.js + OPFS 持久化）
 * 替代 node:sqlite，数据库完全在手机浏览器内运行
 */
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
const DB_NAME = 'mimi-finance.db';

// 初始化 OPFS
async function getOpfsHandle(): Promise<FileSystemFileHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getFileHandle(DB_NAME, { create: true });
}

// 从 OPFS 读取数据库
async function loadFromOpfs(): Promise<Uint8Array | null> {
  try {
    const handle = await getOpfsHandle();
    const file = await handle.getFile();
    if (file.size > 0) {
      return new Uint8Array(await file.arrayBuffer());
    }
  } catch {}
  return null;
}

// 保存到 OPFS
let saveTimer: ReturnType<typeof setTimeout> | null = null;
async function saveToOpfs() {
  if (!db) return;
  // 防抖：500ms 内的多次写入合并为一次保存
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const handle = await getOpfsHandle();
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(db!.export()));
      await writable.close();
    } catch (e) {
      console.error('OPFS 保存失败:', e);
    }
  }, 500);
}

// 初始化数据库
export async function initClientDb(): Promise<Database> {
  if (db) return db;

  SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  // 尝试从 OPFS 加载已有数据库
  const saved = await loadFromOpfs();
  if (saved) {
    db = new SQL.Database(saved);
  } else {
    db = new SQL.Database();
    initSchema(db);
    seedIfEmpty(db);
    await saveToOpfs();
  }

  return db;
}

export function getClientDb(): Database {
  if (!db) throw new Error('数据库未初始化，请先调用 initClientDb()');
  return db;
}

// 自动保存（每次写操作后调用）
export function markDirty() {
  saveToOpfs();
}

// ========== Schema（与服务端完全一致）==========

function initSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'cash', 'alipay', 'wechat', 'other')),
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      icon TEXT DEFAULT 'wallet',
      color TEXT DEFAULT '#3b82f6',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT DEFAULT 'tag',
      color TEXT DEFAULT '#6b7280',
      parent_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      to_account_id INTEGER REFERENCES accounts(id),
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      icon TEXT DEFAULT 'target',
      color TEXT DEFAULT '#10b981',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS savings_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES savings_goals(id),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      spent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(category_id, month)
    );

    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      settlement INTEGER NOT NULL DEFAULT 1,
      current_nav REAL,
      nav_date TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS fund_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      amount REAL NOT NULL,
      nav_at_purchase REAL NOT NULL,
      shares REAL NOT NULL,
      sold_shares REAL NOT NULL DEFAULT 0,
      fee REAL NOT NULL DEFAULT 0,
      trade_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      settlement_date TEXT,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS fund_sells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      shares REAL NOT NULL,
      nav_at_sell REAL NOT NULL,
      amount REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS auto_invests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      account_id INTEGER NOT NULL,
      next_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

function seedIfEmpty(database: Database) {
  const result = database.exec('SELECT COUNT(*) as cnt FROM categories');
  const count = result[0]?.values[0]?.[0] as number;
  if (count > 0) return;

  const incomeCategories = [
    { name: '工资', icon: 'briefcase', color: '#22c55e' },
    { name: '兼职', icon: 'clock', color: '#84cc16' },
    { name: '理财收益', icon: 'trending-up', color: '#06b6d4' },
    { name: '红包', icon: 'gift', color: '#f43f5e' },
    { name: '其他收入', icon: 'plus-circle', color: '#a78bfa' },
  ];

  const expenseCategories = [
    { name: '餐饮', icon: 'utensils', color: '#f97316' },
    { name: '交通', icon: 'car', color: '#eab308' },
    { name: '购物', icon: 'shopping-bag', color: '#ec4899' },
    { name: '居住', icon: 'home', color: '#8b5cf6' },
    { name: '娱乐', icon: 'gamepad-2', color: '#6366f1' },
    { name: '医疗', icon: 'heart-pulse', color: '#ef4444' },
    { name: '教育', icon: 'book-open', color: '#3b82f6' },
    { name: '通讯', icon: 'phone', color: '#14b8a6' },
    { name: '其他支出', icon: 'minus-circle', color: '#78716c' },
  ];

  for (const c of incomeCategories) {
    database.run('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)', [c.name, 'income', c.icon, c.color]);
  }
  for (const c of expenseCategories) {
    database.run('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)', [c.name, 'expense', c.icon, c.color]);
  }

  database.run('INSERT INTO accounts (name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?)', ['工商银行', 'bank', 50000, 'landmark', '#3b82f6']);
  database.run('INSERT INTO accounts (name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?)', ['支付宝', 'alipay', 8000, 'smartphone', '#06b6d4']);
  database.run('INSERT INTO accounts (name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?)', ['微信钱包', 'wechat', 2000, 'message-circle', '#22c55e']);
  database.run('INSERT INTO accounts (name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?)', ['现金', 'cash', 500, 'banknote', '#f97316']);

  database.run('INSERT INTO savings_goals (name, target_amount, current_amount, deadline, icon, color) VALUES (?, ?, ?, ?, ?, ?)', ['紧急备用金', 30000, 15000, '2025-12-31', 'shield', '#f43f5e']);
  database.run('INSERT INTO savings_goals (name, target_amount, current_amount, deadline, icon, color) VALUES (?, ?, ?, ?, ?, ?)', ['旅行基金', 20000, 8000, '2025-10-01', 'plane', '#8b5cf6']);
  database.run('INSERT INTO savings_goals (name, target_amount, current_amount, deadline, icon, color) VALUES (?, ?, ?, ?, ?, ?)', ['新电脑', 12000, 5000, '2025-09-01', 'laptop', '#3b82f6']);

  // 示例基金
  database.run('INSERT OR IGNORE INTO funds (code, name, type, settlement) VALUES (?, ?, ?, ?)', ['000001', '华夏成长混合', 'mix', 1]);
  database.run('INSERT OR IGNORE INTO funds (code, name, type, settlement) VALUES (?, ?, ?, ?)', ['161725', '招商中证白酒指数(LOF)A', 'index', 1]);
  database.run('INSERT OR IGNORE INTO funds (code, name, type, settlement) VALUES (?, ?, ?, ?)', ['005827', '易方达蓝筹精选混合', 'mix', 1]);
}

// ========== 辅助：把 sql.js 返回的数组转对象 ==========
// sql.js prepare+step 用法不方便，封装为 node:sqlite 风格
export function queryAll(database: Database, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = database.prepare(sql);
  stmt.bind(params as (string | number | null)[]);
  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

export function queryOne(database: Database, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const stmt = database.prepare(sql);
  stmt.bind(params as (string | number | null)[]);
  let result: Record<string, unknown> | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

export function execRun(database: Database, sql: string, params: unknown[] = []) {
  database.run(sql, params as (string | number | null)[]);
}

// 给 db-ops.ts 用的辅助方法（处理 unknown 类型）
export function safeRun(db: Database, sql: string, params: unknown[] = []) {
  db.run(sql, params as (string | number | null)[]);
}
export function safePrepare(db: Database, sql: string) {
  return db.prepare(sql);
}
