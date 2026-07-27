import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { Category } from '@/types';

// GET /api/categories
export function GET() {
  try {
    const db = getDb();
    const categories = db.prepare(
      'SELECT * FROM categories ORDER BY type, id'
    ).all() as unknown as Category[];
    return success(categories);
  } catch (e) {
    return error('获取分类失败: ' + (e as Error).message, 500);
  }
}

// POST /api/categories
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, icon, color } = body;

    if (!name || !type) {
      return error('名称和类型不能为空');
    }

    if (!['income', 'expense'].includes(type)) {
      return error('分类类型只能是 income 或 expense');
    }

    const db = getDb();
    db.prepare(
      'INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)'
    ).run(name, type, icon || 'tag', color || '#6b7280');

    const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(lastId.id) as unknown as Category;
    return success(category, 201);
  } catch (e) {
    return error('创建分类失败: ' + (e as Error).message, 500);
  }
}
