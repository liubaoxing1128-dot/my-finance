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
import { Plus, Trash2, Pencil, Tags } from 'lucide-react';
import type { Category, CategoryKind } from '@/types';

const colors = ['#22c55e', '#84cc16', '#06b6d4', '#f43f5e', '#a78bfa', '#f97316', '#eab308', '#ec4899', '#8b5cf6', '#6366f1', '#ef4444', '#3b82f6', '#14b8a6', '#78716c'];

interface CatForm { name: string; type: CategoryKind; color: string; }
const emptyForm: CatForm = { name: '', type: 'expense', color: '#f97316' };

export default function CategoriesPage() {
  const { categories, refreshAll } = useAppStore();
  const [open, setOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [form, setForm] = useState<CatForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { refreshAll(); }, []);

  const incomeCats = categories.filter(c => c.type === 'income');
  const expenseCats = categories.filter(c => c.type === 'expense');

  const openEdit = (c: Category) => {
    setEditCat(c);
    setForm({ name: c.name, type: c.type, color: c.color });
    setOpen(true);
  };

  const openNew = (type: CategoryKind) => {
    setEditCat(null);
    setForm({ ...emptyForm, type, color: type === 'income' ? '#22c55e' : '#f97316' });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name) { toast.error('请输入分类名称'); return; }
    setSaving(true);
    try {
      const url = editCat ? `/api/categories/${editCat.id}` : '/api/categories';
      const method = editCat ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) {
        toast.success(editCat ? '分类已更新' : '分类已创建');
        setOpen(false); setEditCat(null); setForm(emptyForm);
        refreshAll();
      } else { toast.error(data.error); }
    } catch (e: any) { toast.error(e?.message || "操作失败"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个分类吗？使用此分类的交易将变为"未分类"。')) return;
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('已删除'); refreshAll(); }
    else { toast.error(data.error); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">分类管理</h2>
          <p className="text-muted-foreground">共 {categories.length} 个分类</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditCat(null); }}>
          <DialogTrigger
            className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all"
            onClick={() => openNew('expense')}
          >
            <Plus className="w-4 h-4" />添加分类
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editCat ? '编辑分类' : '添加分类'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>分类名称</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：理财收益" />
              </div>
              <div>
                <Label>类型</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as CategoryKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">收入</SelectItem>
                    <SelectItem value="expense">支出</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>颜色标识</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
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
                {saving ? '保存中...' : (editCat ? '更新分类' : '创建分类')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 收入分类 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500">收入</Badge>
                <span className="text-sm text-muted-foreground">{incomeCats.length} 项</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => openNew('income')}>
                <Plus className="w-3 h-3 mr-1" />添加
              </Button>
            </div>
            <div className="space-y-2">
              {incomeCats.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: c.color }}>
                      {c.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 支出分类 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">支出</Badge>
                <span className="text-sm text-muted-foreground">{expenseCats.length} 项</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => openNew('expense')}>
                <Plus className="w-3 h-3 mr-1" />添加
              </Button>
            </div>
            <div className="space-y-2">
              {expenseCats.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: c.color }}>
                      {c.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
