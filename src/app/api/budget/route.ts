import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { Budget, BudgetWithCategory, CreateBudgetInput } from '@/types';

// GET /api/budget?month=2025-07
export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const budgets = db.prepare(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.month = ?
      ORDER BY b.id
    `).all(month) as unknown as BudgetWithCategory[];

    return success(budgets);
  } catch (e) {
    return error('获取预算失败: ' + (e as Error).message, 500);
  }
}

// POST /api/budget
export async function POST(req: NextRequest) {
  try {
    const body: CreateBudgetInput = await req.json();
    const { category_id, amount, month } = body;

    if (!category_id || !amount || !month) {
      return error('分类、金额和月份不能为空');
    }

    const db = getDb();

    // 计算当月已使用额度
    const spent = db.prepare(`
      SELECT COALESCE(SUM(t.amount), 0) as total
      FROM transactions t
      WHERE t.category_id = ? AND t.type = 'expense' AND strftime('%Y-%m', t.date) = ?
    `).get(category_id, month) as { total: number };

    // UPSERT
    db.prepare(`
      INSERT INTO budgets (category_id, amount, month, spent)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(category_id, month) DO UPDATE SET amount=excluded.amount
    `).run(category_id, amount, month, spent.total);

    const budget = db.prepare(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM budgets b JOIN categories c ON b.category_id = c.id
      WHERE b.category_id = ? AND b.month = ?
    `).get(category_id, month) as unknown as BudgetWithCategory;

    return success(budget, 201);
  } catch (e) {
    return error('创建预算失败: ' + (e as Error).message, 500);
  }
}
