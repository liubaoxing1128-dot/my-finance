export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { SavingsGoal, CreateSavingsGoalInput } from '@/types';

// GET /api/savings
export function GET() {
  try {
    const db = getDb();
    const goals = db.prepare(
      "SELECT * FROM savings_goals WHERE status != 'cancelled' ORDER BY created_at DESC"
    ).all() as unknown as SavingsGoal[];
    return success(goals);
  } catch (e) {
    return error('获取储蓄目标失败: ' + (e as Error).message, 500);
  }
}

// POST /api/savings
export async function POST(req: NextRequest) {
  try {
    const body: CreateSavingsGoalInput = await req.json();
    const { name, target_amount, deadline, icon, color } = body;

    if (!name || !target_amount) {
      return error('目标名称和金额不能为空');
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO savings_goals (name, target_amount, deadline, icon, color)
       VALUES (?, ?, ?, ?, ?)`
    ).run(name, target_amount, deadline || null, icon || 'target', color || '#10b981');

    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(lastId.id) as unknown as SavingsGoal;
    return success(goal, 201);
  } catch (e) {
    return error('创建储蓄目标失败: ' + (e as Error).message, 500);
  }
}
