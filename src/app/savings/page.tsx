'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, PiggyBank, Trash2, Pencil, Goal } from 'lucide-react';
import type { SavingsGoal } from '@/types';

const colors = ['#10b981', '#8b5cf6', '#3b82f6', '#f43f5e', '#f97316', '#06b6d4', '#ec4899'];

const formatMoney = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

interface GoalForm {
  name: string; target_amount: string; deadline: string; color: string;
}

const emptyForm: GoalForm = { name: '', target_amount: '', deadline: '', color: '#10b981' };

export default function SavingsPage() {
  const { savingsGoals, refreshAll } = useAppStore();
  const [open, setOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositGoal, setDepositGoal] = useState<SavingsGoal | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [depositAmount, setDepositAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { refreshAll(); }, []);

  const openEdit = (g: SavingsGoal) => {
    setEditGoal(g);
    setForm({
      name: g.name, target_amount: String(g.target_amount),
      deadline: g.deadline || '', color: g.color,
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditGoal(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.target_amount) { toast.error('请填写目标名称和金额'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name, target_amount: Number(form.target_amount),
        deadline: form.deadline || null, color: form.color,
      };
      const url = editGoal ? `/api/savings/${editGoal.id}` : '/api/savings';
      const method = editGoal ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        toast.success(editGoal ? '目标已更新' : '储蓄目标已创建');
        setOpen(false); setEditGoal(null); setForm(emptyForm);
        refreshAll();
      } else { toast.error(data.error); }
    } catch { toast.error('操作失败'); }
    finally { setSaving(false); }
  };

  const handleDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0 || !depositGoal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/savings/${depositGoal.id}/deposit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(depositAmount), date: new Date().toISOString().slice(0, 10) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已存入 ${formatMoney(Number(depositAmount))}`);
        if (data.data.goal.status === 'completed') toast.success('🎉 目标达成！');
        setDepositOpen(false); setDepositAmount(''); setDepositGoal(null);
        refreshAll();
      } else { toast.error(data.error); }
    } catch { toast.error('操作失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个储蓄目标吗？')) return;
    const res = await fetch(`/api/savings/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('已删除'); refreshAll(); }
    else { toast.error(data.error); }
  };

  const totalTarget = savingsGoals.filter(g => g.status === 'active').reduce((s, g) => s + g.target_amount, 0);
  const totalCurrent = savingsGoals.filter(g => g.status === 'active').reduce((s, g) => s + g.current_amount, 0);

  const dialogTitle = editGoal ? '编辑储蓄目标' : '新建储蓄目标';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">储蓄目标</h2>
          <p className="text-muted-foreground">
            已存 {formatMoney(totalCurrent)} / {formatMoney(totalTarget)}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditGoal(null); }}>
          <DialogTrigger
            className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all"
            onClick={openNew}
          >
            <Plus className="w-4 h-4" />新建目标
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>目标名称</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：紧急备用金" />
              </div>
              <div>
                <Label>目标金额 (¥)</Label>
                <Input type="number" step="0.01" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} placeholder="30000" />
              </div>
              <div>
                <Label>截止日期（可选）</Label>
                <Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
              </div>
              <div>
                <Label>颜色标识</Label>
                <div className="flex gap-2 mt-1">
                  {colors.map(c => (
                    <button key={c} type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm({ ...form, color: c })}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={saving} className="w-full">
                {saving ? '保存中...' : (editGoal ? '更新目标' : '创建目标')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {savingsGoals.map(goal => {
          const pct = Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100);
          const remaining = goal.target_amount - goal.current_amount;
          return (
            <Card key={goal.id} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: goal.color }} />
              <CardContent className="p-6 pt-7">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: goal.color }}>
                      <Goal className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{goal.name}</h3>
                      <Badge variant={goal.status === 'completed' ? 'default' : 'secondary'} className="text-xs mt-0.5">
                        {goal.status === 'completed' ? '已达成 🎉' : goal.status === 'cancelled' ? '已取消' : '进行中'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(goal)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(goal.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatMoney(goal.current_amount)}</span>
                    <span className="text-muted-foreground">{formatMoney(goal.target_amount)}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {goal.status === 'completed' ? '目标已达成！' :
                     remaining > 0 ? `还差 ${formatMoney(remaining)} · ${pct}%` : '已完成'}
                    {goal.deadline && ` · ${goal.deadline} 截止`}
                  </p>
                </div>

                {goal.status !== 'completed' && (
                  <Button variant="outline" size="sm" className="w-full mt-3"
                    onClick={() => { setDepositGoal(goal); setDepositOpen(true); }}>
                    <PiggyBank className="w-4 h-4 mr-1" />存入一笔
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {savingsGoals.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <PiggyBank className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>还没有储蓄目标</p>
            <p className="text-sm mt-1">创建目标，让存钱更有动力</p>
          </CardContent>
        </Card>
      )}

      {/* 存入弹窗 */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>存入一笔 - {depositGoal?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              目标：{formatMoney(depositGoal?.target_amount || 0)} · 已存：{formatMoney(depositGoal?.current_amount || 0)} · 还差：{formatMoney((depositGoal?.target_amount || 0) - (depositGoal?.current_amount || 0))}
            </p>
            <div>
              <Label>存入金额 (¥)</Label>
              <Input type="number" step="0.01" value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button onClick={handleDeposit} disabled={saving} className="w-full">
              {saving ? '存入中...' : '确认存入'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
