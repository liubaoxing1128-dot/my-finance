import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'data', 'finance.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    // 确保 data 目录存在
    const fs = require('node:fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    initSchema(db);
    seedIfEmpty(db);
  }
  return db;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    -- 账户表
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

    -- 分类表
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT DEFAULT 'tag',
      color TEXT DEFAULT '#6b7280',
      parent_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 交易流水表
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

    -- 储蓄目标表
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

    -- 储蓄存入记录
    CREATE TABLE IF NOT EXISTS savings_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES savings_goals(id),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 基金表（用代码做唯一标识）
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('stock','mix','bond','index','qdi','money','other')),
      settlement INTEGER NOT NULL DEFAULT 1 CHECK(settlement IN (1, 2)),
      current_nav REAL,
      nav_date TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 基金持仓表（支持 T+1/T+2 和部分卖出）
    CREATE TABLE IF NOT EXISTS fund_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL REFERENCES funds(code),
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

    -- 基金卖出记录
    CREATE TABLE IF NOT EXISTS fund_sells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL REFERENCES funds(code),
      shares REAL NOT NULL,
      nav_at_sell REAL NOT NULL,
      amount REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 定投计划
    CREATE TABLE IF NOT EXISTS auto_invests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL REFERENCES funds(code),
      amount REAL NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('weekly','biweekly','monthly')),
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      next_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','stopped')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 预算表
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      spent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(category_id, month)
    );
  `);
}

function seedIfEmpty(db: DatabaseSync) {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as unknown as { cnt: number };
  if (count.cnt > 0) return;

  // 收入分类
  const incomeCategories = [
    { name: '工资', icon: 'briefcase', color: '#22c55e' },
    { name: '兼职', icon: 'clock', color: '#84cc16' },
    { name: '理财收益', icon: 'trending-up', color: '#06b6d4' },
    { name: '红包', icon: 'gift', color: '#f43f5e' },
    { name: '其他收入', icon: 'plus-circle', color: '#a78bfa' },
  ];

  // 支出分类
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

  const insertCat = db.prepare(
    'INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)'
  );

  for (const c of incomeCategories) {
    insertCat.run(c.name, 'income', c.icon, c.color);
  }
  for (const c of expenseCategories) {
    insertCat.run(c.name, 'expense', c.icon, c.color);
  }

  // 示例账户
  const insertAccount = db.prepare(
    'INSERT INTO accounts (name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?)'
  );
  insertAccount.run('工商银行', 'bank', 50000, 'landmark', '#3b82f6');
  insertAccount.run('支付宝', 'alipay', 8000, 'smartphone', '#06b6d4');
  insertAccount.run('微信钱包', 'wechat', 2000, 'message-circle', '#22c55e');
  insertAccount.run('现金', 'cash', 500, 'banknote', '#f97316');

  // 示例储蓄目标
  const insertGoal = db.prepare(
    'INSERT INTO savings_goals (name, target_amount, current_amount, deadline, icon, color) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertGoal.run('紧急备用金', 30000, 15000, '2025-12-31', 'shield', '#f43f5e');
  insertGoal.run('旅行基金', 20000, 8000, '2025-10-01', 'plane', '#8b5cf6');
  insertGoal.run('新电脑', 12000, 5000, '2025-09-01', 'laptop', '#3b82f6');

  // 示例基金
  seedFunds(db);

  // 示例交易数据（近3个月，让仪表盘有数据可看）
  seedTransactions(db);
}

function seedFunds(db: DatabaseSync) {
  const insertFund = db.prepare(
    'INSERT OR IGNORE INTO funds (code, name, type, settlement) VALUES (?, ?, ?, ?)'
  );
  insertFund.run('000001', '华夏成长混合', 'mix', 1);
  insertFund.run('001632', '天弘中证食品饮料ETF联接A', 'index', 1);
  insertFund.run('005827', '易方达蓝筹精选混合', 'mix', 1);
  insertFund.run('161725', '招商中证白酒指数(LOF)A', 'index', 1);
  insertFund.run('002939', '广发创新升级混合', 'mix', 1);
  // QDII 基金 T+2
  insertFund.run('000041', '华夏全球股票(QDII)', 'qdi', 2);

  const insertHolding = db.prepare(
    'INSERT INTO fund_holdings (fund_code, amount, nav_at_purchase, shares, sold_shares, fee, trade_time, settlement_date, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertHolding.run('161725', 5000, 0.9820, 5080.45, 0, 7.5, '2025-05-15 10:30', '2025-05-16', '2025-05-15', null);
  insertHolding.run('005827', 3000, 1.8560, 1610.34, 0, 4.5, '2025-06-01 09:00', '2025-06-02', '2025-06-01', '定投第1期');
}

function seedTransactions(db: DatabaseSync) {
  // 数据（相对于种子数据的月份偏移）
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12

  const fmt = (monthOffset: number, day: number) => {
    let mm = m - monthOffset;
    let yy = y;
    if (mm <= 0) { mm += 12; yy -= 1; }
    return `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const insertTxn = db.prepare(
    `INSERT INTO transactions (type, amount, description, date, account_id, to_account_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  // 辅助：获取分类 id（按插入顺序：收入1-5，支出1-9）
  const catId = (type: 'income' | 'expense', idx: number) => {
    const offset = type === 'income' ? 0 : 5;
    return offset + idx;
  };

  // 本月交易
  insertTxn.run('income', 15000, '工资', fmt(0, 5), 1, null, catId('income', 1));
  insertTxn.run('expense', 45, '午餐外卖', fmt(0, 5), 2, null, catId('expense', 1));
  insertTxn.run('expense', 200, '超市购物', fmt(0, 6), 1, null, catId('expense', 3));
  insertTxn.run('expense', 3500, '房租', fmt(0, 1), 1, null, catId('expense', 4));
  insertTxn.run('expense', 120, '地铁充值', fmt(0, 8), 3, null, catId('expense', 2));
  insertTxn.run('income', 500, '朋友红包', fmt(0, 10), 3, null, catId('income', 4));
  insertTxn.run('expense', 88, '看电影', fmt(0, 12), 2, null, catId('expense', 5));
  insertTxn.run('expense', 55, '话费充值', fmt(0, 14), 3, null, catId('expense', 8));
  insertTxn.run('transfer', 2000, '转到储蓄', fmt(0, 15), 1, 2, null);
  insertTxn.run('expense', 320, '聚餐', fmt(0, 18), 1, null, catId('expense', 1));
  insertTxn.run('income', 2000, '项目奖金', fmt(0, 20), 1, null, catId('income', 3));
  insertTxn.run('expense', 150, '买书', fmt(0, 22), 2, null, catId('expense', 7));

  // 上月交易
  insertTxn.run('income', 15000, '工资', fmt(1, 5), 1, null, catId('income', 1));
  insertTxn.run('expense', 3500, '房租', fmt(1, 1), 1, null, catId('expense', 4));
  insertTxn.run('expense', 350, '买衣服', fmt(1, 8), 1, null, catId('expense', 3));
  insertTxn.run('expense', 60, '打车', fmt(1, 10), 3, null, catId('expense', 2));
  insertTxn.run('expense', 280, '体检', fmt(1, 15), 2, null, catId('expense', 6));
  insertTxn.run('income', 800, '兼职', fmt(1, 18), 2, null, catId('income', 2));
  insertTxn.run('expense', 160, '游戏充值', fmt(1, 20), 2, null, catId('expense', 5));
  insertTxn.run('expense', 90, '网费', fmt(1, 22), 3, null, catId('expense', 8));

  // 两月前交易
  insertTxn.run('income', 15000, '工资', fmt(2, 5), 1, null, catId('income', 1));
  insertTxn.run('expense', 3500, '房租', fmt(2, 1), 1, null, catId('expense', 4));
  insertTxn.run('expense', 500, '超市购物', fmt(2, 10), 1, null, catId('expense', 3));
  insertTxn.run('income', 1200, '理财收益', fmt(2, 15), 1, null, catId('income', 3));
  insertTxn.run('expense', 200, '药品', fmt(2, 18), 3, null, catId('expense', 6));
  insertTxn.run('expense', 300, '聚餐', fmt(2, 20), 1, null, catId('expense', 1));

  // 更新账户余额（直接设定最终值，反映所有示例交易后余额）
  db.prepare('UPDATE accounts SET balance=? WHERE id=?').run(39062, 1);    // 工商银行
  db.prepare('UPDATE accounts SET balance=? WHERE id=?').run(11127, 2);    // 支付宝
  db.prepare('UPDATE accounts SET balance=? WHERE id=?').run(2445, 3);     // 微信钱包
  db.prepare('UPDATE accounts SET balance=? WHERE id=?').run(500, 4);      // 现金
}

// 关闭数据库连接（应用退出时调用）
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
