import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';

// DELETE /api/funds/:code
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM funds WHERE code = ?').get(code);
    if (!existing) return notFound('基金不存在');

    db.prepare('DELETE FROM fund_holdings WHERE fund_code = ?').run(code);
    db.prepare('DELETE FROM funds WHERE code = ?').run(code);

    return success({ deleted: true });
  } catch (e) {
    return error('删除基金失败: ' + (e as Error).message, 500);
  }
}
