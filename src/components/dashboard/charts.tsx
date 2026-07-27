'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import type { MonthlyTrend, CategorySpending } from '@/types';
import { useMemo } from 'react';

interface ChartsProps {
  trends: MonthlyTrend[];
  spendings: CategorySpending[];
  loading: boolean;
}

const formatYuan = (v: number) => `¥${(v / 1000).toFixed(1)}k`;

export function Charts({ trends, spendings, loading }: ChartsProps) {
  const pieData = useMemo(() => {
    if (!spendings?.length) return [];
    const total = spendings.reduce((s, c) => s + c.amount, 0);
    return spendings.map(c => ({
      name: c.name,
      value: c.amount,
      color: c.color,
      percent: total > 0 ? ((c.amount / total) * 100).toFixed(1) : '0',
    }));
  }, [spendings]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="animate-pulse"><CardContent className="p-6 h-72" /></Card>
        <Card className="animate-pulse"><CardContent className="p-6 h-72" /></Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {/* 月度收支趋势 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">近6月收支趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" fontSize={12} tickFormatter={(v: string) => v.slice(2)} />
              <YAxis fontSize={12} tickFormatter={formatYuan} />
              <Tooltip
                formatter={(value) => `¥${Number(value).toLocaleString('zh-CN')}`}
                labelFormatter={(label) => `${label} 月`}
              />
              <Bar dataKey="income" name="收入" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="支出" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 本月支出分类 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">本月支出分类</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground">
              本月暂无支出数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, entry: any) =>
                    [`¥${Number(value).toLocaleString('zh-CN')} (${entry.payload.percent}%)`, _name]
                  }
                />
                <Legend
                  formatter={(value) => <span className="text-xs">{String(value)}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
