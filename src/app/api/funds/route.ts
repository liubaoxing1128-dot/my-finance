import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { Fund, FundHoldingWithFund, FundSummary } from '@/types';

// GET /api/funds — 获取所有持仓基金汇总
export function GET() {
  try {
    const db = getDb();
    const funds = db.prepare(`
      SELECT f.*,
        COALESCE((SELECT SUM(shares - sold_shares) FROM fund_holdings h WHERE h.fund_code = f.code AND shares > sold_shares), 0) as total_shares,
        COALESCE((SELECT SUM(amount * (1.0 * (shares - sold_shares) / NULLIF(shares, 0))) FROM fund_holdings h WHERE h.fund_code = f.code AND shares > sold_shares), 0) as total_invested
      FROM funds f
      ORDER BY f.created_at DESC
    `).all() as unknown as (Fund & { total_shares: number; total_invested: number })[];

    // 获取所有持仓记录
    const allHoldings = db.prepare(`
      SELECT h.*,
        f.name as fund_name, f.type as fund_type, f.current_nav,
        (h.shares * f.current_nav) as market_value,
        (h.shares * f.current_nav - h.amount) as profit,
        CASE WHEN h.amount > 0 THEN ROUND((h.shares * f.current_nav - h.amount) / h.amount * 100, 2) ELSE NULL END as profit_rate
      FROM fund_holdings h
      JOIN funds f ON h.fund_code = f.code
      ORDER BY h.date DESC
    `).all() as unknown as FundHoldingWithFund[];

    // 按基金分组
    const holdingsByFund: Record<string, FundHoldingWithFund[]> = {};
    for (const h of allHoldings) {
      if (!holdingsByFund[h.fund_code]) holdingsByFund[h.fund_code] = [];
      holdingsByFund[h.fund_code].push(h);
    }

    const summary: FundSummary = {
      total_invested: 0,
      total_market_value: 0,
      total_profit: 0,
      total_profit_rate: 0,
      fund_count: funds.length,
    };

    const enriched = funds.map((f) => {
      const invested = f.total_invested;
      const shares = f.total_shares;
      const marketValue = f.current_nav ? shares * f.current_nav : null;
      const profit = marketValue !== null ? marketValue - invested : null;
      const profitRate = profit !== null && invested > 0 ? (profit / invested) * 100 : null;

      summary.total_invested += invested;
      if (marketValue !== null) summary.total_market_value += marketValue;

      return {
        ...f,
        shares,
        invested,
        market_value: marketValue,
        profit,
        profit_rate: profitRate ? Math.round(profitRate * 100) / 100 : null,
        holdings: holdingsByFund[f.code] || [],
      };
    });

    summary.total_profit = summary.total_market_value - summary.total_invested;
    summary.total_profit_rate = summary.total_invested > 0
      ? (summary.total_profit / summary.total_invested) * 100
      : 0;

    return success({ funds: enriched, summary });
  } catch (e) {
    return error('获取基金失败: ' + (e as Error).message, 500);
  }
}

// POST /api/funds — 添加基金到跟踪列表
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, type, settlement } = body;
    if (!code || !name) return error('基金代码和名称不能为空');

    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO funds (code, name, type, settlement) VALUES (?, ?, ?, ?)')
      .run(String(code), name, type || 'other', settlement || 1);

    const fund = db.prepare('SELECT * FROM funds WHERE code = ?').get(String(code)) as unknown as Fund;
    return success(fund, 201);
  } catch (e) {
    return error('添加基金失败: ' + (e as Error).message, 500);
  }
}
