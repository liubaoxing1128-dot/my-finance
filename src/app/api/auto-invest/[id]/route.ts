import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { AutoInvestWithFund, FundHolding } from '@/types';

// PUT /api/auto-invest/:id — 更新状态或暂停
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = db.prepare('SELECT * FROM auto_invests WHERE id = ?').get(Number(id));
    if (!existing) return notFound('定投计划不存在');

    const next_date = body.next_date ?? (existing as any).next_date;
    const status = body.status ?? (existing as any).status;

    db.prepare(
      "UPDATE auto_invests SET next_date=?, status=?, updated_at=datetime('now','localtime') WHERE id=?"
    ).run(next_date, status, Number(id));

    const plan = db.prepare(`
      SELECT a.*, f.name as fund_name, f.type as fund_type, f.current_nav, ac.name as account_name
      FROM auto_invests a JOIN funds f ON a.fund_code = f.code JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = ?
    `).get(Number(id)) as unknown as AutoInvestWithFund;

    return success(plan);
  } catch (e) {
    return error('更新定投失败: ' + (e as Error).message, 500);
  }
}

// DELETE /api/auto-invest/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM auto_invests WHERE id = ?').run(Number(id));
    if (result.changes === 0) return notFound('定投计划不存在');
    return success({ deleted: true });
  } catch (e) {
    return error('删除定投失败: ' + (e as Error).message, 500);
  }
}

// POST /api/auto-invest/:id — 手动执行一次定投（扣款+买入）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const plan = db.prepare(`
      SELECT a.*, f.current_nav, f.settlement
      FROM auto_invests a JOIN funds f ON a.fund_code = f.code WHERE a.id = ?
    `).get(Number(id)) as unknown as (AutoInvestWithFund & { settlement: number; current_nav: number }) | undefined;

    if (!plan) return notFound('定投计划不存在');
    if (!plan.current_nav) return error('请先刷新基金净值');

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(plan.account_id) as unknown as { balance: number } | undefined;
    if (!account) return error('扣款账户不存在');
    if (account.balance < plan.amount) return error(`账户余额不足（余额：¥${account.balance.toFixed(2)}）`);

    const feeAmt = 0;
    const shares = (plan.amount - feeAmt) / plan.current_nav;
    const today = new Date().toISOString().slice(0, 10);

    // 计算确认日期
    function nextTradingDay(date: Date, offset: number): string {
      const d = new Date(date);
      let added = 0;
      while (added < offset) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) added++;
      }
      return d.toISOString().slice(0, 10);
    }
    const settlementDate = nextTradingDay(new Date(), plan.settlement);

    // 扣款
    db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(plan.amount, plan.account_id);

    // 记录交易
    db.prepare(
      `INSERT INTO transactions (type, amount, description, date, account_id, category_id)
       VALUES ('expense', ?, ?, ?, ?, NULL)`
    ).run(plan.amount, `定投: ${plan.fund_name}`, today, plan.account_id);

    // 买入基金
    db.prepare(`
      INSERT INTO fund_holdings (fund_code, amount, nav_at_purchase, shares, fee, trade_time, settlement_date, date, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(plan.fund_code, plan.amount, plan.current_nav, shares, feeAmt,
      new Date().toISOString().slice(0, 19),
      settlementDate, today, `定投买入`);

    // 更新下次执行日期
    const nextDate = new Date(plan.next_date);
    const freq = plan.frequency;
    if (freq === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else if (freq === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);
    else nextDate.setMonth(nextDate.getMonth() + 1);

    db.prepare("UPDATE auto_invests SET next_date=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(nextDate.toISOString().slice(0, 10), Number(id));

    return success({
      shares, nav: plan.current_nav, settlement_date: settlementDate,
      next_date: nextDate.toISOString().slice(0, 10),
      account_balance: account.balance - plan.amount,
    });
  } catch (e) {
    return error('执行定投失败: ' + (e as Error).message, 500);
  }
}
