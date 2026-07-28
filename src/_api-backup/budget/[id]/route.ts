export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';

// DELETE /api/budget/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM budgets WHERE id = ?').run(Number(id));
    if (result.changes === 0) return notFound('预算记录不存在');
    return success({ deleted: true });
  } catch (e) {
    return error('删除预算失败: ' + (e as Error).message, 500);
  }
}
