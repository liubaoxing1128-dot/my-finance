import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { SavingsGoal, SavingsDeposit } from '@/types';

// POST /api/savings/:id/deposit
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { amount, date, note } = body;

    if (!amount || amount <= 0) {
      return error('存入金额必须大于0');
    }

    const db = getDb();
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(Number(id)) as unknown as SavingsGoal | undefined;
    if (!goal) return notFound('储蓄目标不存在');

    // 插入存款记录
    db.prepare(
      'INSERT INTO savings_deposits (goal_id, amount, date, note) VALUES (?, ?, ?, ?)'
    ).run(Number(id), amount, date || new Date().toISOString().slice(0, 10), note || null);

    // 更新目标当前金额
    const newCurrent = goal.current_amount + amount;
    const newStatus = newCurrent >= goal.target_amount ? 'completed' : 'active';
    db.prepare(
      `UPDATE savings_goals SET current_amount=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(newCurrent, newStatus, Number(id));

    // 获取更新后的目标
    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(Number(id)) as unknown as SavingsGoal;

    // 获取存款记录
    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    const deposit = db.prepare('SELECT * FROM savings_deposits WHERE id = ?').get(lastId.id) as unknown as SavingsDeposit;

    return success({ goal: updated, deposit }, 201);
  } catch (e) {
    return error('存入失败: ' + (e as Error).message, 500);
  }
}
