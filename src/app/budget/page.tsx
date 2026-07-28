'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, ChartNoAxesGantt } from 'lucide-react';
import type { BudgetWithCategory } from '@/types';
import { getBudgets, setBudget, deleteBudget } from '@/lib/db-ops';

const formatMoney = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export default function BudgetPage() {
  const { categories, refreshAll } = useAppStore();
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [open, setOpen] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [form, setForm] = useState({ category_id: '', amount: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { refreshAll(); }, []);

  const fetchBudgets = (m: string) => {
    try {
      setBudgets(getBudgets(m) as unknown as BudgetWithCategory[]);
    } catch {}
  };

  useEffect(() => { fetchBudgets(month); }, [month]);

  const expenseCats = categories.filter(c => c.type === 'expense');

  const handleSetBudget = () => {
    if (!form.category_id || !form.amount) { toast.error('请选择分类和预算金额'); return; }
    setSaving(true);
    try {
      setBudget({ category_id: Number(form.category_id), amount: Number(form.amount), month });
      toast.success('预算已设定');
      setOpen(false); setForm({ category_id: '', amount: '' });
      fetchBudgets(month);
    } catch (e: any) { toast.error(e?.message || "操作失败"); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    if (!confirm('确定要删除这个预算吗？')) return;
    deleteBudget(id);
    toast.success('预算已删除'); fetchBudgets(month);
  };

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">预算管理</h2>
          <p className="text-muted-foreground">
            预算总额 {formatMoney(totalBudget)} · 已使用 {formatMoney(totalSpent)} · 剩余 {formatMoney(totalBudget - totalSpent)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all">
              <Plus className="w-4 h-4" />设定预算
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>设定月度预算</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>支出分类</Label>
                  <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                    <SelectContent>
                      {expenseCats.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>预算金额 (¥)</Label>
                  <Input type="number" step="0.01" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
                <Button onClick={handleSetBudget} disabled={saving} className="w-full">
                  {saving ? '保存中...' : '确认设定'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 总进度 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">总体预算进度</span>
            <span className="text-sm text-muted-foreground">{Math.round(totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}%</span>
          </div>
          <Progress value={totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0} className="h-3" />
        </CardContent>
      </Card>

      {/* 各分类预算 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.map(b => {
          const pct = Math.min(Math.round((b.spent / b.amount) * 100), 100);
          const isOver = b.spent > b.amount;
          return (
            <Card key={b.id} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: b.category_color }}>
                      <span className="text-xs font-bold">{b.category_name?.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{b.category_name}</h3>
                      <Badge variant={isOver ? 'destructive' : 'secondary'} className="text-xs mt-0.5">
                        {isOver ? '超支' : pct >= 80 ? '即将超支' : '正常'}
                      </Badge>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(b.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className={isOver ? 'text-destructive font-semibold' : ''}>{formatMoney(b.spent)}</span>
                    <span className="text-muted-foreground">{formatMoney(b.amount)}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isOver ? `超支 ${formatMoney(b.spent - b.amount)}` : `剩余 ${formatMoney(b.amount - b.spent)}`}
                    {' · '}{pct}%
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {budgets.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <ChartNoAxesGantt className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>还没有设定月度预算</p>
            <p className="text-sm mt-1">为各项支出设定预算上限，控制开销</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
