import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { Transaction, TransactionWithDetails } from '@/types';

// GET /api/transactions/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
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
    `).get(Number(id)) as unknown as TransactionWithDetails | undefined;

    if (!txn) return notFound('交易记录不存在');
    return success(txn);
  } catch (e) {
    return error('获取交易失败: ' + (e as Error).message, 500);
  }
}

// PUT /api/transactions/:id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const oldTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id)) as unknown as Transaction | undefined;
    if (!oldTxn) return notFound('交易记录不存在');

    const updateBalance = db.prepare(
      "UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?"
    );

    // 1. 撤销旧的余额变动
    if (oldTxn.type === 'transfer' && oldTxn.to_account_id) {
      updateBalance.run(oldTxn.amount, oldTxn.account_id);        // 源账户加回
      updateBalance.run(-oldTxn.amount, oldTxn.to_account_id);     // 目标账户扣回
    } else if (oldTxn.type === 'expense') {
      updateBalance.run(oldTxn.amount, oldTxn.account_id);         // 账户加回
    } else if (oldTxn.type === 'income') {
      updateBalance.run(-oldTxn.amount, oldTxn.account_id);        // 账户扣回
    }

    // 2. 撤销旧的预算额度
    if (oldTxn.type === 'expense' && oldTxn.category_id) {
      const oldMonth = oldTxn.date.substring(0, 7);
      db.prepare('UPDATE budgets SET spent=MAX(0, spent-?) WHERE category_id=? AND month=?')
        .run(oldTxn.amount, oldTxn.category_id, oldMonth);
    }

    // 3. 合并更新字段
    const type = body.type ?? oldTxn.type;
    const amount = body.amount != null ? Number(body.amount) : oldTxn.amount;
    const description = body.description !== undefined ? body.description : oldTxn.description;
    const date = body.date ?? oldTxn.date;
    const account_id = body.account_id != null ? Number(body.account_id) : oldTxn.account_id;
    const to_account_id = body.to_account_id !== undefined ? (body.to_account_id ? Number(body.to_account_id) : null) : oldTxn.to_account_id;
    const category_id = body.category_id !== undefined ? (body.category_id ? Number(body.category_id) : null) : oldTxn.category_id;

    // 4. 更新交易记录
    db.prepare(`
      UPDATE transactions
      SET type=?, amount=?, description=?, date=?, account_id=?, to_account_id=?, category_id=?
      WHERE id=?
    `).run(type, amount, description, date, account_id, to_account_id, category_id, Number(id));

    // 5. 应用新的余额变动
    if (type === 'transfer' && to_account_id) {
      updateBalance.run(-amount, account_id);      // 源账户扣钱
      updateBalance.run(amount, to_account_id);     // 目标账户加钱
    } else if (type === 'expense') {
      updateBalance.run(-amount, account_id);       // 账户扣钱
    } else if (type === 'income') {
      updateBalance.run(amount, account_id);        // 账户加钱
    }

    // 6. 应用新的预算额度
    if (type === 'expense' && category_id) {
      const newMonth = date.substring(0, 7);
      db.prepare('UPDATE budgets SET spent=spent+? WHERE category_id=? AND month=?')
        .run(amount, category_id, newMonth);
    }

    // 返回更新后的交易（含关联数据）
    const updated = db.prepare(`
      SELECT t.*,
        a.name as account_name, a.icon as account_icon, a.color as account_color,
        ta.name as to_account_name,
        c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `).get(Number(id)) as unknown as TransactionWithDetails;

    return success(updated);
  } catch (e) {
    return error('更新交易失败: ' + (e as Error).message, 500);
  }
}

// DELETE /api/transactions/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id)) as unknown as Transaction | undefined;
    if (!txn) return notFound('交易记录不存在');

    const updateBalance = db.prepare(
      "UPDATE accounts SET balance=balance+?, updated_at=datetime('now','localtime') WHERE id=?"
    );

    // 撤销账户余额变动
    if (txn.type === 'transfer' && txn.to_account_id) {
      updateBalance.run(txn.amount, txn.account_id);       // 源账户加回
      updateBalance.run(-txn.amount, txn.to_account_id);    // 目标账户扣回
    } else if (txn.type === 'expense') {
      updateBalance.run(txn.amount, txn.account_id);        // 账户加回
    } else {
      updateBalance.run(-txn.amount, txn.account_id);       // 账户扣回
    }

    // 撤销预算额度
    if (txn.type === 'expense' && txn.category_id) {
      const txMonth = txn.date.substring(0, 7);
      db.prepare('UPDATE budgets SET spent=MAX(0, spent-?) WHERE category_id=? AND month=?')
        .run(txn.amount, txn.category_id, txMonth);
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(id));
    return success({ deleted: true });
  } catch (e) {
    return error('删除交易失败: ' + (e as Error).message, 500);
  }
}
