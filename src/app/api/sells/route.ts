import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { FundSellWithFund } from '@/types';

// GET /api/sells?fund_code=xxx
export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const fundCode = searchParams.get('fund_code');

    let sql = `
      SELECT s.*, f.name as fund_name, f.type as fund_type
      FROM fund_sells s JOIN funds f ON s.fund_code = f.code
    `;
    const params: string[] = [];
    if (fundCode) { sql += ' WHERE s.fund_code = ?'; params.push(fundCode); }
    sql += ' ORDER BY s.date DESC';

    const sells = db.prepare(sql).all(...params) as unknown as FundSellWithFund[];
    return success(sells);
  } catch (e) {
    return error('获取卖出记录失败: ' + (e as Error).message, 500);
  }
}

// POST /api/sells — 卖出基金
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fund_code, shares, nav_at_sell, fee, date, note } = body;

    if (!fund_code || !shares || !nav_at_sell || !date) {
      return error('基金代码、份额、净值和日期不能为空');
    }

    const sellShares = Number(shares);
    const nav = Number(nav_at_sell);
    const feeAmt = Number(fee) || 0;
    const amount = sellShares * nav - feeAmt;

    const db = getDb();

    // 按先进先出原则扣减持仓份额
    let remaining = sellShares;
    const holdings = db.prepare(
      'SELECT * FROM fund_holdings WHERE fund_code = ? AND sold_shares < shares ORDER BY date ASC'
    ).all(String(fund_code)) as unknown as {
      id: number; shares: number; sold_shares: number;
    }[];

    const totalAvailable = holdings.reduce((s, h) => s + h.shares - h.sold_shares, 0);
    if (totalAvailable < sellShares) {
      return error(`可卖份额不足（可卖：${totalAvailable.toFixed(2)} 份）`);
    }

    for (const h of holdings) {
      if (remaining <= 0) break;
      const available = h.shares - h.sold_shares;
      const deduct = Math.min(available, remaining);
      db.prepare('UPDATE fund_holdings SET sold_shares = sold_shares + ? WHERE id = ?')
        .run(deduct, h.id);
      remaining -= deduct;
    }

    // 插入卖出记录
    db.prepare(
      'INSERT INTO fund_sells (fund_code, shares, nav_at_sell, amount, fee, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(String(fund_code), sellShares, nav, amount, feeAmt, date, note || null);

    // 将卖出金额加入对应账户（默认第一个活跃账户）
    const defaultAccount = db.prepare(
      'SELECT id FROM accounts WHERE is_active = 1 ORDER BY id LIMIT 1'
    ).get() as unknown as { id: number } | undefined;

    if (defaultAccount) {
      db.prepare(
        "UPDATE accounts SET balance = balance + ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(amount, defaultAccount.id);
    }

    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as unknown as { id: number };
    const sell = db.prepare(`
      SELECT s.*, f.name as fund_name, f.type as fund_type
      FROM fund_sells s JOIN funds f ON s.fund_code = f.code WHERE s.id = ?
    `).get(lastId.id) as unknown as FundSellWithFund;

    return success(sell, 201);
  } catch (e) {
    return error('卖出失败: ' + (e as Error).message, 500);
  }
}
