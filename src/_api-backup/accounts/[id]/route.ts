export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error, notFound } from '@/lib/api-utils';
import type { Account, UpdateAccountInput } from '@/types';

// GET /api/accounts/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(id)) as unknown as Account | undefined;
    if (!account) return notFound('账户不存在');
    return success(account);
  } catch (e) {
    return error('获取账户失败: ' + (e as Error).message, 500);
  }
}

// PUT /api/accounts/:id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: UpdateAccountInput = await req.json();
    const db = getDb();

    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(id)) as unknown as Account | undefined;
    if (!existing) return notFound('账户不存在');

    const name = body.name ?? existing.name;
    const type = body.type ?? existing.type;
    const balance = body.balance ?? existing.balance;
    const currency = body.currency ?? existing.currency;
    const icon = body.icon ?? existing.icon;
    const color = body.color ?? existing.color;

    db.prepare(
      `UPDATE accounts SET name=?, type=?, balance=?, currency=?, icon=?, color=?, updated_at=datetime('now','localtime')
       WHERE id=?`
    ).run(name, type, balance, currency, icon, color, Number(id));

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(id)) as unknown as Account;
    return success(account);
  } catch (e) {
    return error('更新账户失败: ' + (e as Error).message, 500);
  }
}

// DELETE /api/accounts/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    // 软删除
    db.prepare("UPDATE accounts SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(Number(id));
    return success({ deleted: true });
  } catch (e) {
    return error('删除账户失败: ' + (e as Error).message, 500);
  }
}
