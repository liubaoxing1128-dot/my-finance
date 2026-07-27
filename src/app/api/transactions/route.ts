import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { Transaction, TransactionWithDetails, CreateTransactionInput } from '@/types';

// GET /api/transactions?month=2025-07&limit=50
export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM
    const limit = Number(searchParams.get('limit')) || 50;

    let sql = `
      SELECT t.*,
        a.name as account_name, a.icon as account_icon, a.color as account_color,
        ta.name as to_account_name,
        c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN categories c ON t.category_id = c.id
    `;
    const params: (string | number)[] = [];

    if (month) {
      sql += ` WHERE strftime('%Y-%m', t.date) = ?`;
      params.push(month);
    }

    sql += ` ORDER BY t.date DESC, t.id DESC LIMIT ?`;
    params.push(limit);

    const transactions = db.prepare(sql).all(...params) as unknown as TransactionWithDetails[];
    return success(transactions);
  } catch (e) {
    return error('获取交易记录失败: ' + (e as Error).message, 500);
  }
}

// POST /api/transactions
export async function POST(req: NextRequest) {
  try {
    const body: CreateTransactionInput = await req.json();
    const { type, amount, description, date, account_id, to_account_id, category_id } = body;

    if (!type || !amount || !date || !account_id) {
      return error('交易类型、金额、日期和账户不能为空');
    }

    const db = getDb();

    // 使用事务确保数据一致性
    const insertTxn = db.prepare(`
      INSERT INTO transactions (type, amount, description, date, account_id, to_account_id, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateBalance = db.prepare('UPDATE accounts SET balance=balance+?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?');

    // 转账：源账户扣钱，目标账户加钱
    if (type === 'transfer' && to_account_id) {
      insertTxn.run(type, amount, description, date, account_id, to_account_id, category_id);
      updateBalance.run(-amount, account_id);
      updateBalance.run(amount, to_account_id);
    }
    // 支出：账户扣钱
    else if (type === 'expense') {
      insertTxn.run(type, amount, description, date, account_id, null, category_id);
      updateBalance.run(-amount, account_id);
    }
    // 收入：账户加钱
    else {
      insertTxn.run(type, amount, description, date, account_id, null, category_id);
      updateBalance.run(amount, account_id);
    }

    // 更新预算已使用额度
    if (type === 'expense' && category_id) {
      const txMonth = date.substring(0, 7); // YYYY-MM
      db.prepare(
        'UPDATE budgets SET spent=spent+? WHERE category_id=? AND month=?'
      ).run(amount, category_id, txMonth);
    }

    // 获取最新插入的交易（含关联数据）
    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    const txn = db.prepare(`
      SELECT t.*,
        a.name as account_name, a.icon as account_icon, a.color as account_color,
        ta.name as to_account_name,
        c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `).get(lastId.id) as unknown as TransactionWithDetails;

    return success(txn, 201);
  } catch (e) {
    return error('创建交易失败: ' + (e as Error).message, 500);
  }
}
