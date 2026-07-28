export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { success, error } from '@/lib/api-utils';
import type { Account, CreateAccountInput } from '@/types';

// GET /api/accounts
export function GET() {
  try {
    const db = getDb();
    const accounts = db.prepare(
      'SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at DESC'
    ).all() as unknown as Account[];
    return success(accounts);
  } catch (e) {
    return error('获取账户列表失败: ' + (e as Error).message, 500);
  }
}

// POST /api/accounts
export async function POST(req: NextRequest) {
  try {
    const body: CreateAccountInput = await req.json();
    const { name, type, balance, currency, icon, color } = body;

    if (!name || !type) {
      return error('账户名称和类型不能为空');
    }

    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO accounts (name, type, balance, currency, icon, color)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      name,
      type,
      balance ?? 0,
      currency ?? 'CNY',
      icon ?? 'wallet',
      color ?? '#3b82f6'
    );

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid) as unknown as Account;
    return success(account, 201);
  } catch (e) {
    return error('创建账户失败: ' + (e as Error).message, 500);
  }
}
