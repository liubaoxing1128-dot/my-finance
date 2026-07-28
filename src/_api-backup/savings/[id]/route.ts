export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { SavingsGoal } from '@/types';

// PUT /api/savings/:id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(Number(id)) as unknown as SavingsGoal | undefined;
    if (!existing) return notFound('储蓄目标不存在');

    const name = body.name ?? existing.name;
    const target_amount = body.target_amount ?? existing.target_amount;
    const deadline = body.deadline !== undefined ? body.deadline : existing.deadline;
    const icon = body.icon ?? existing.icon;
    const color = body.color ?? existing.color;
    const status = body.status ?? existing.status;

    db.prepare(
      `UPDATE savings_goals SET name=?, target_amount=?, deadline=?, icon=?, color=?, status=?,
       updated_at=datetime('now','localtime') WHERE id=?`
    ).run(name, target_amount, deadline, icon, color, status, Number(id));

    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(Number(id)) as unknown as SavingsGoal;
    return success(goal);
  } catch (e) {
    return error('更新储蓄目标失败: ' + (e as Error).message, 500);
  }
}

// DELETE /api/savings/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM savings_deposits WHERE goal_id = ?').run(Number(id));
    db.prepare('DELETE FROM savings_goals WHERE id = ?').run(Number(id));
    return success({ deleted: true });
  } catch (e) {
    return error('删除储蓄目标失败: ' + (e as Error).message, 500);
  }
}
