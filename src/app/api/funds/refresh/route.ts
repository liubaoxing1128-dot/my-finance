import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';

// GET /api/funds/refresh
export async function GET() {
  try {
    const db = getDb();
    const funds = db.prepare('SELECT code FROM funds').all() as unknown as { code: string }[];

    let updated = 0;
    const errors: string[] = [];

    for (const { code } of funds) {
      try {
        const nav = await fetchFundNav(code);
        if (nav) {
          db.prepare(
            "UPDATE funds SET current_nav=?, nav_date=?, updated_at=datetime('now','localtime') WHERE code=?"
          ).run(nav.nav, nav.date, code);
          updated++;
        }
      } catch (e) {
        errors.push(`${code}: ${(e as Error).message}`);
      }
    }

    return success({ updated, total: funds.length, errors });
  } catch (e) {
    return error('刷新净值失败: ' + (e as Error).message, 500);
  }
}

interface FundNav {
  nav: number;
  date: string;
}

// 从天天基金历史净值接口获取最新净值
async function fetchFundNav(code: string): Promise<FundNav | null> {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://fund.eastmoney.com/',
    },
  });

  if (!resp.ok) return null;

  const body = await resp.json();

  if (body.ErrCode !== 0 || !body.Data?.LSJZList?.length) return null;

  const latest = body.Data.LSJZList[0];

  return {
    nav: parseFloat(latest.DWJZ),
    date: latest.FSRQ,
  };
}
