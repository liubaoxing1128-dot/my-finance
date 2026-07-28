export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';

// GET /api/funds/refresh?codes=000001,161725（可选）
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const codesParam = searchParams.get('codes');

    // 如果传了 codes，优先用传的；否则查服务端 DB
    let codes: string[];
    if (codesParam) {
      codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
    } else {
      const funds = db.prepare('SELECT code FROM funds').all() as unknown as { code: string }[];
      codes = funds.map(f => f.code);
    }

    let updated = 0;
    const errors: string[] = [];
    const results: { code: string; nav: number; date: string }[] = [];

    for (const code of codes) {
      try {
        const nav = await fetchFundNav(code);
        if (nav) {
          // 更新服务端 DB（如果存在）
          db.prepare(
            "UPDATE funds SET current_nav=?, nav_date=?, updated_at=datetime('now','localtime') WHERE code=?"
          ).run(nav.nav, nav.date, code);
          results.push({ code, nav: nav.nav, date: nav.date });
          updated++;
        }
      } catch (e) {
        errors.push(`${code}: ${(e as Error).message}`);
      }
    }

    return success({ updated, total: codes.length, errors, results });
  } catch (e) {
    return error('刷新净值失败: ' + (e as Error).message, 500);
  }
}

interface FundNav { nav: number; date: string; }

async function fetchFundNav(code: string): Promise<FundNav | null> {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' },
  });
  if (!resp.ok) return null;
  const body = await resp.json();
  if (body.ErrCode !== 0 || !body.Data?.LSJZList?.length) return null;
  const latest = body.Data.LSJZList[0];
  return { nav: parseFloat(latest.DWJZ), date: latest.FSRQ };
}
