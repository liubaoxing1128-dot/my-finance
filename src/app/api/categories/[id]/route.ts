import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { Category } from '@/types';

// PUT /api/categories/:id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id)) as unknown as Category | undefined;
    if (!existing) return notFound('分类不存在');

    const name = body.name ?? existing.name;
    const type = body.type ?? existing.type;
    const icon = body.icon ?? existing.icon;
    const color = body.color ?? existing.color;

    db.prepare(
      'UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=?'
    ).run(name, type, icon, color, Number(id));

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id)) as unknown as Category;
    return success(category);
  } catch (e) {
    return error('更新分类失败: ' + (e as Error).message, 500);
  }
}

// DELETE /api/categories/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id)) as unknown as Category | undefined;
    if (!existing) return notFound('分类不存在');

    // 将使用此分类的交易设为 null
    db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?').run(Number(id));
    // 删除相关预算
    db.prepare('DELETE FROM budgets WHERE category_id = ?').run(Number(id));
    // 删除分类
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(id));

    return success({ deleted: true });
  } catch (e) {
    return error('删除分类失败: ' + (e as Error).message, 500);
  }
}
