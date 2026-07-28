export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { FundHoldingWithFund } from '@/types';

// 辅助：计算交易日（跳过周末）
function nextTradingDay(date: Date, offset: number): string {
  const d = new Date(date);
  let added = 0;
  while (added < offset) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++; // 0=Sun, 6=Sat
  }
  return d.toISOString().slice(0, 10);
}

// GET /api/holdings?fund_code=xxx
export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const fundCode = searchParams.get('fund_code');

    let sql = `
      SELECT h.*,
        f.name as fund_name, f.type as fund_type,
        f.current_nav,
        ((h.shares - h.sold_shares) * f.current_nav) as market_value,
        ((h.shares - h.sold_shares) * f.current_nav - (h.amount * (1 - h.sold_shares / h.shares))) as profit,
        CASE WHEN h.amount > 0 AND h.shares > 0
          THEN ROUND(((h.shares - h.sold_shares) * f.current_nav - (h.amount * (h.shares - h.sold_shares) / h.shares)) / (h.amount * (h.shares - h.sold_shares) / h.shares) * 100, 2)
          ELSE NULL END as profit_rate
      FROM fund_holdings h
      JOIN funds f ON h.fund_code = f.code
      WHERE h.shares > h.sold_shares
    `;
    const params: string[] = [];

    if (fundCode) {
      sql += ' AND h.fund_code = ?';
      params.push(fundCode);
    }

    sql += ' ORDER BY h.date DESC';

    const holdings = db.prepare(sql).all(...params) as unknown as FundHoldingWithFund[];
    return success(holdings);
  } catch (e) {
    return error('获取持仓失败: ' + (e as Error).message, 500);
  }
}

// POST /api/holdings — 买入
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fund_code, amount, nav_at_purchase, date, fee, note, trade_time } = body;

    if (!fund_code || !amount || !nav_at_purchase || !date) {
      return error('基金代码、金额、净值和日期不能为空');
    }

    const amt = Number(amount);
    const nav = Number(nav_at_purchase);
    const feeAmt = Number(fee) || 0;
    const shares = (amt - feeAmt) / nav;

    // 获取基金结算类型
    const db = getDb();
    const fund = db.prepare('SELECT * FROM funds WHERE code = ?').get(String(fund_code)) as unknown as { settlement: number } | undefined;
    const settlementDays = (fund?.settlement) || 1;

    // 计算确认日期
    const tradeDt = trade_time ? new Date(trade_time) : new Date(date + 'T15:00:00');
    const settlementDate = nextTradingDay(tradeDt, settlementDays);

    db.prepare(`
      INSERT INTO fund_holdings (fund_code, amount, nav_at_purchase, shares, fee, trade_time, settlement_date, date, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(fund_code), amt, nav, shares, feeAmt,
      trade_time || (date + 'T15:00:00'),
      settlementDate,
      date, note || null);

    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as unknown as { id: number };
    const holding = db.prepare(`
      SELECT h.*, f.name as fund_name, f.type as fund_type, f.current_nav
      FROM fund_holdings h JOIN funds f ON h.fund_code = f.code WHERE h.id = ?
    `).get(lastId.id) as unknown as FundHoldingWithFund;

    return success({ holding, settlement_date: settlementDate }, 201);
  } catch (e) {
    return error('添加持仓失败: ' + (e as Error).message, 500);
  }
}
