import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { AutoInvestWithFund } from '@/types';

// GET /api/auto-invest
export function GET() {
  try {
    const db = getDb();
    const plans = db.prepare(`
      SELECT a.*, f.name as fund_name, f.type as fund_type, f.current_nav,
        ac.name as account_name
      FROM auto_invests a
      JOIN funds f ON a.fund_code = f.code
      JOIN accounts ac ON a.account_id = ac.id
      ORDER BY a.status, a.next_date
    `).all() as unknown as AutoInvestWithFund[];
    return success(plans);
  } catch (e) {
    return error('获取定投计划失败: ' + (e as Error).message, 500);
  }
}

// POST /api/auto-invest
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fund_code, amount, frequency, account_id, next_date } = body;

    if (!fund_code || !amount || !frequency || !account_id || !next_date) {
      return error('所有字段不能为空');
    }

    const db = getDb();
    db.prepare(`
      INSERT INTO auto_invests (fund_code, amount, frequency, account_id, next_date, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(String(fund_code), Number(amount), frequency, Number(account_id), next_date);

    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as unknown as { id: number };
    const plan = db.prepare(`
      SELECT a.*, f.name as fund_name, f.type as fund_type, f.current_nav, ac.name as account_name
      FROM auto_invests a JOIN funds f ON a.fund_code = f.code JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = ?
    `).get(lastId.id) as unknown as AutoInvestWithFund;

    return success(plan, 201);
  } catch (e) {
    return error('创建定投失败: ' + (e as Error).message, 500);
  }
}
