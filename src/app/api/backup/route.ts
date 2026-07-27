import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';

// GET /api/backup — 导出所有数据
export function GET() {
  try {
    const db = getDb();
    const tables = [
      'accounts', 'categories', 'transactions',
      'savings_goals', 'savings_deposits', 'budgets',
      'funds', 'fund_holdings', 'fund_sells', 'auto_invests',
    ];

    const data: Record<string, unknown[]> = {};
    for (const table of tables) {
      try {
        data[table] = db.prepare(`SELECT * FROM "${table}"`).all() as unknown[];
      } catch {
        data[table] = [];
      }
    }

    return success({
      version: 1,
      exported_at: new Date().toISOString(),
      data,
    });
  } catch (e) {
    return error('备份失败: ' + (e as Error).message, 500);
  }
}

// POST /api/backup — 恢复数据
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.data || !body.version) {
      return error('无效的备份文件');
    }

    const db = getDb();
    const tables = [
      'auto_invests', 'fund_sells', 'fund_holdings', 'funds',
      'budgets', 'savings_deposits', 'savings_goals',
      'transactions', 'categories', 'accounts',
    ];

    let imported = 0;

    for (const table of tables) {
      const rows = body.data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

      // 获取列名
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const colNames = cols.map(c => `"${c}"`).join(',');

      // 清空旧数据
      db.prepare(`DELETE FROM "${table}"`).run();

      // 插入新数据
      const stmt = db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`);

      for (const row of rows) {
        const values = cols.map(c => row[c]);
        try { stmt.run(...values); imported++; } catch {}
      }
    }

    return success({ imported });
  } catch (e) {
    return error('恢复失败: ' + (e as Error).message, 500);
  }
}
