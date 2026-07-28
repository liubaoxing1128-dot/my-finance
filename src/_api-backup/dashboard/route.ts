export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { DashboardSummary, MonthlyTrend, CategorySpending } from '@/types';

// GET /api/dashboard?type=summary|trends|spendings
export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'summary';
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    switch (type) {
      case 'trends':
        return getTrends(db);
      case 'spendings':
        return getSpendings(db, currentMonth);
      default:
        return getSummary(db, currentMonth);
    }
  } catch (e) {
    return error('获取仪表盘数据失败: ' + (e as Error).message, 500);
  }
}

function getSummary(db: ReturnType<typeof getDb>, currentMonth: string) {
  // 总资产
  const balanceResult = db.prepare(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE is_active = 1'
  ).get() as { total: number };

  // 本月收入
  const incomeResult = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND strftime('%Y-%m', date) = ?"
  ).get(currentMonth) as { total: number };

  // 本月支出
  const expenseResult = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND strftime('%Y-%m', date) = ?"
  ).get(currentMonth) as { total: number };

  // 储蓄进度
  const savingsResult = db.prepare(
    "SELECT COALESCE(AVG(current_amount * 100.0 / NULLIF(target_amount, 0)), 0) as pct FROM savings_goals WHERE status = 'active'"
  ).get() as { pct: number };

  // 预算使用率
  const budgetResult = db.prepare(
    'SELECT COALESCE(AVG(spent * 100.0 / NULLIF(amount, 0)), 0) as pct FROM budgets WHERE month = ?'
  ).get(currentMonth) as { pct: number };

  const summary: DashboardSummary = {
    total_balance: balanceResult.total,
    monthly_income: incomeResult.total,
    monthly_expense: expenseResult.total,
    monthly_balance: incomeResult.total - expenseResult.total,
    savings_progress: Math.round(savingsResult.pct),
    budget_usage: Math.round(budgetResult.pct),
  };

  return success(summary);
}

function getTrends(db: ReturnType<typeof getDb>) {
  const trends = db.prepare(`
    SELECT
      strftime('%Y-%m', date) as month,
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
    FROM transactions
    WHERE date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month
  `).all() as unknown as MonthlyTrend[];

  return success(trends);
}

function getSpendings(db: ReturnType<typeof getDb>, currentMonth: string) {
  const spendings = db.prepare(`
    SELECT
      c.name,
      COALESCE(SUM(t.amount), 0) as amount,
      c.color
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.type = 'expense'
      AND strftime('%Y-%m', t.date) = ?
    WHERE c.type = 'expense'
    GROUP BY c.id
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(currentMonth) as unknown as CategorySpending[];

  return success(spendings);
}
