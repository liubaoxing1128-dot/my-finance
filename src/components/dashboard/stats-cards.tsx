'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp, Wallet, PiggyBank, Target, ChartNoAxesGantt } from 'lucide-react';

interface StatsCardsProps {
  dashboard: {
    total_balance: number;
    monthly_income: number;
    monthly_expense: number;
    monthly_balance: number;
    savings_progress: number;
    budget_usage: number;
  } | null;
  loading: boolean;
}

const formatMoney = (v: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(v);

export function StatsCards({ dashboard, loading }: StatsCardsProps) {
  if (loading || !dashboard) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: '总资产',
      value: formatMoney(dashboard.total_balance),
      icon: Wallet,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: '本月收入',
      value: formatMoney(dashboard.monthly_income),
      icon: TrendingUp,
      color: 'text-green-500',
      bg: 'bg-green-50',
    },
    {
      label: '本月支出',
      value: formatMoney(dashboard.monthly_expense),
      icon: TrendingDown,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
    },
    {
      label: '本月结余',
      value: formatMoney(dashboard.monthly_balance),
      icon: PiggyBank,
      color: dashboard.monthly_balance >= 0 ? 'text-purple-500' : 'text-red-500',
      bg: dashboard.monthly_balance >= 0 ? 'bg-purple-50' : 'bg-red-50',
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.bg)}>
                  <card.icon className={cn('w-5 h-5', card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 进度条 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium">储蓄进度</span>
              </div>
              <span className={cn(
                'text-sm font-bold',
                dashboard.savings_progress >= 100 ? 'text-emerald-500' : 'text-muted-foreground'
              )}>{dashboard.savings_progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(dashboard.savings_progress, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ChartNoAxesGantt className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">本月预算使用</span>
              </div>
              <span className={cn(
                'text-sm font-bold',
                dashboard.budget_usage > 80 ? 'text-red-500' : 'text-muted-foreground'
              )}>{dashboard.budget_usage}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className={cn(
                  'h-2.5 rounded-full transition-all duration-700',
                  dashboard.budget_usage > 80 ? 'bg-red-500' :
                  dashboard.budget_usage > 60 ? 'bg-amber-500' : 'bg-blue-500'
                )}
                style={{ width: `${Math.min(dashboard.budget_usage, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

