import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';

// DELETE /api/sells/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM fund_sells WHERE id = ?').run(Number(id));
    if (result.changes === 0) return notFound('卖出记录不存在');
    return success({ deleted: true });
  } catch (e) {
    return error('删除卖出记录失败: ' + (e as Error).message, 500);
  }
}
