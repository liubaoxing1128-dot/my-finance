'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { Charts } from '@/components/dashboard/charts';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

const formatMoney = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const {
    dashboard, monthlyTrends, categorySpendings,
    transactions, accounts, loading,
    refreshAll,
  } = useAppStore();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const recentTxns = transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">仪表盘</h2>
        <p className="text-muted-foreground">欢迎回来，这是你的财务状况概览</p>
      </div>

      <StatsCards dashboard={dashboard} loading={loading} />

      <Charts trends={monthlyTrends} spendings={categorySpendings} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 最近交易 */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">最近交易</h3>
              <Link href="/transactions" className="text-sm text-primary hover:underline">
                查看全部
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">暂无交易记录</p>
            ) : (
              <div className="space-y-2">
                {recentTxns.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: t.category_color || t.account_color }}
                      >
                        {t.type === 'income' ? '收' : t.type === 'expense' ? '支' : '转'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {t.description || t.category_name || t.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.account_name} · {t.date}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${
                      t.type === 'income' ? 'text-green-500' :
                      t.type === 'expense' ? 'text-red-500' : 'text-blue-500'
                    }`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 账户概览 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">账户概览</h3>
              <Link href="/accounts" className="text-sm text-primary hover:underline">
                管理
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{ backgroundColor: a.color + '20', color: a.color }}
                      >
                        {a.name.charAt(0)}
                      </div>
                      <span className="text-sm">{a.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{formatMoney(a.balance)}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t flex justify-between">
                  <span className="text-sm font-medium">总计</span>
                  <span className="text-sm font-bold text-primary">
                    {formatMoney(accounts.reduce((s, a) => s + a.balance, 0))}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
