'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Landmark, Smartphone, MessageCircle, Banknote, Wallet } from 'lucide-react';
import type { Account, AccountType } from '@/types';
import { createAccount, updateAccount, deleteAccount } from '@/lib/db-ops';

const accountTypeConfig: Record<AccountType, { label: string; icon: React.ReactNode }> = {
  bank: { label: '银行账户', icon: <Landmark className="w-4 h-4" /> },
  alipay: { label: '支付宝', icon: <Smartphone className="w-4 h-4" /> },
  wechat: { label: '微信钱包', icon: <MessageCircle className="w-4 h-4" /> },
  cash: { label: '现金', icon: <Banknote className="w-4 h-4" /> },
  other: { label: '其他', icon: <Wallet className="w-4 h-4" /> },
};

const colors = ['#3b82f6', '#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#f43f5e', '#78716c'];

const formatMoney = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export default function AccountsPage() {
  const { accounts, refreshAll } = useAppStore();
  const [open, setOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: '', type: 'bank' as AccountType, balance: 0, currency: 'CNY', color: '#3b82f6' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { refreshAll(); }, []);

  const handleSubmit = () => {
    if (!form.name) { toast.error('请输入账户名称'); return; }
    setSaving(true);
    try {
      if (editAccount) {
        updateAccount(editAccount.id, form);
      } else {
        createAccount(form);
      }
      toast.success(editAccount ? '账户已更新' : '账户已创建');
      setOpen(false); setEditAccount(null);
      setForm({ name: '', type: 'bank', balance: 0, currency: 'CNY', color: '#3b82f6' });
      refreshAll();
    } catch (e: any) { toast.error(e?.message || '操作失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    if (!confirm('确定要删除这个账户吗？')) return;
    try {
      deleteAccount(id);
      toast.success('账户已删除'); refreshAll();
    } catch (e: any) { toast.error(e?.message || '操作失败'); }
  };

  const openEdit = (a: Account) => {
    setEditAccount(a);
    setForm({ name: a.name, type: a.type, balance: a.balance, currency: a.currency, color: a.color });
    setOpen(true);
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">账户管理</h2>
          <p className="text-muted-foreground">总资产：{formatMoney(totalBalance)}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditAccount(null); }}>
          <DialogTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all">
            <Plus className="w-4 h-4" />添加账户
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editAccount ? '编辑账户' : '添加账户'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>账户名称</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：工商银行" />
              </div>
              <div>
                <Label>账户类型</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as AccountType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(accountTypeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>初始余额</Label>
                <Input type="number" step="0.01" value={form.balance} onChange={e => setForm({ ...form, balance: Number(e.target.value) })} />
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
                {saving ? '保存中...' : (editAccount ? '更新账户' : '创建账户')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(a => (
          <Card key={a.id} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: a.color }} />
            <CardContent className="p-6 pt-7">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: a.color }}>
                    {accountTypeConfig[a.type]?.icon || <Wallet className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{a.name}</h3>
                    <Badge variant="secondary" className="mt-0.5 text-xs">
                      {accountTypeConfig[a.type]?.label || a.type}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-2xl font-bold mt-4">{formatMoney(a.balance)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {accounts.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>还没有添加账户</p>
            <p className="text-sm mt-1">点击"添加账户"开始管理你的资产</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
