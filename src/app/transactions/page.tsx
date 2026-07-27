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
import { Plus, Trash2, Pencil, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Search, Mic, MicOff } from 'lucide-react';
import type { Category, TransactionType, TransactionWithDetails } from '@/types';

const txTypeConfig: Record<TransactionType, { label: string; icon: React.ReactNode; color: string }> = {
  income: { label: '收入', icon: <ArrowUpRight className="w-4 h-4" />, color: 'text-green-500 bg-green-50' },
  expense: { label: '支出', icon: <ArrowDownRight className="w-4 h-4" />, color: 'text-red-500 bg-red-50' },
  transfer: { label: '转账', icon: <ArrowRightLeft className="w-4 h-4" />, color: 'text-blue-500 bg-blue-50' },
};

const formatMoney = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

interface TxnForm {
  type: TransactionType; amount: string; description: string; date: string;
  account_id: string; to_account_id: string; category_id: string;
}

const emptyForm: TxnForm = {
  type: 'expense', amount: '', description: '', date: new Date().toISOString().slice(0, 10),
  account_id: '', to_account_id: '', category_id: '',
};

export default function TransactionsPage() {
  const { transactions, accounts, categories, refreshAll } = useAppStore();
  const [open, setOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionWithDetails | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<TxnForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => { refreshAll(); }, []);

  // === 语音输入 ===
  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error('当前浏览器不支持语音识别，请使用 Chrome'); return; }

    setListening(true);
    setEditTxn(null);
    setForm(emptyForm);
    setOpen(true);
    toast('正在聆听...请说话 (例如: 午餐花了45块)', { duration: 4000 });

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.start();

    recognition.onresult = (event: any) => {
      // 收集所有识别结果，取置信度最高的
      let bestText = '';
      for (let i = 0; i < event.results.length; i++) {
        bestText = event.results[i][0].transcript;
      }

      // 如果是中间结果，显示在表单中
      if (!bestText) return;
      setForm(prev => ({ ...prev, description: bestText }));
    };

    recognition.onend = () => {
      setListening(false);
      // 用最终文本解析
      setForm(prev => {
        const parsed = parseVoiceInput(prev.description);
        if (parsed) {
          toast.success(`${parsed.type === 'income' ? '💰收入' : '💸支出'} ¥${parsed.amount}${parsed.desc ? ' — ' + parsed.desc : ''}`);
          return {
            ...prev,
            type: parsed.type,
            amount: String(parsed.amount),
            description: parsed.desc || prev.description,
            account_id: accounts[0]?.id?.toString() || '',
            category_id: parsed.categoryId || '',
          };
        } else {
          toast.error(`说出金额试试？识别内容: "${prev.description}"`);
          return prev;
        }
      });
    };

    recognition.onerror = (e: any) => {
      setListening(false);
      if (e.error === 'not-allowed') toast.error('请允许麦克风权限');
      else if (e.error === 'no-speech') toast.error('未检测到语音，请重试');
      else toast.error('识别失败，请重试');
    };
  };

  // 中文数字转阿拉伯数字
  const cnNumMap: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '两': 2, '百': 100, '千': 1000, '万': 10000,
  };

  function cnToNum(s: string): number | null {
    // 处理 "二十五" "一百五" 这类
    let result = 0;
    let current = 0;

    for (const ch of s) {
      const v = cnNumMap[ch];
      if (v === undefined) continue;
      if (v >= 10) {
        current = (current || 1) * v;
        result += current;
        current = 0;
      } else {
        current = current * 10 + v;
      }
    }
    result += current;
    return result > 0 ? result : null;
  }

  const parseVoiceInput = (text: string) => {
    if (!text) return null;

    // 1. 先尝试阿拉伯数字: 45块, 45元, 45, 45.5
    let amountMatch = text.match(/(\d+\.?\d*)\s*[块元]?/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[1]);
      return classifyAndParse(text, amount);
    }

    // 2. 中文数字: "二十五块" "一百五十元" "一万五"
    const cnMatch = text.match(/[零一二三四五六七八九十两百千万]+/);
    if (cnMatch) {
      const num = cnToNum(cnMatch[0]);
      if (num) return classifyAndParse(text, num);
    }

    // 3. "花了" 后面跟数字 "花了四十五"
    const huaMatch = text.match(/花了?\s*[零一二三四五六七八九十两百千万\d]+/);
    if (huaMatch) {
      const numStr = huaMatch[0].replace('花', '').replace('了', '').trim();
      const arabic = numStr.match(/\d+/);
      if (arabic) return classifyAndParse(text, parseFloat(arabic[0]));
      const cn = cnToNum(numStr);
      if (cn) return classifyAndParse(text, cn);
    }

    // 没匹配到金额
    return null;
  };

  function classifyAndParse(text: string, amount: number) {
    const isIncome = /工资|收入|赚了|红包|奖金|报销|退款|到账|收到|发了/.test(text);
    const type: TransactionType = isIncome ? 'income' : 'expense';

    let categoryId = '';
    const cats = type === 'income' ? incomeCategories : expenseCategories;
    for (const c of cats) {
      if (text.includes(c.name)) { categoryId = String(c.id); break; }
    }

    // 提取描述：去掉金额和常见动词
    let desc = text
      .replace(/\d+\.?\d*\s*[块元]?/g, '')
      .replace(/[零一二三四五六七八九十两百千万]+/g, '')
      .replace(/花了?|买了?|用了?|付了?|交了?|收到了?/g, '')
      .replace(/块|元|了/g, '')
      .trim();

    if (!desc || desc.length === 0) {
      // 根据分类给默认描述
      if (categoryId) {
        desc = cats.find(c => String(c.id) === categoryId)?.name || '';
      } else {
        desc = type === 'income' ? '收入' : '支出';
      }
    }

    return { type, amount, desc, categoryId };
  }

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const openEdit = (t: TransactionWithDetails) => {
    setEditTxn(t);
    setForm({
      type: t.type, amount: String(t.amount), description: t.description || '',
      date: t.date, account_id: String(t.account_id),
      to_account_id: t.to_account_id ? String(t.to_account_id) : '',
      category_id: t.category_id ? String(t.category_id) : '',
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditTxn(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.amount || !form.account_id) { toast.error('请填写必填信息'); return; }
    if (form.type === 'transfer' && !form.to_account_id) { toast.error('请选择目标账户'); return; }
    setSaving(true);
    try {
      const body = {
        type: form.type, amount: Number(form.amount), description: form.description || null,
        date: form.date, account_id: Number(form.account_id),
        to_account_id: form.to_account_id ? Number(form.to_account_id) : null,
        category_id: form.category_id ? Number(form.category_id) : null,
      };
      const url = editTxn ? `/api/transactions/${editTxn.id}` : '/api/transactions';
      const method = editTxn ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        toast.success(editTxn ? '交易已更新' : '交易已记录');
        setOpen(false); setEditTxn(null); setForm(emptyForm);
        refreshAll();
      } else { toast.error(data.error); }
    } catch { toast.error('操作失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条交易吗？余额将被恢复。')) return;
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('交易已删除'); refreshAll(); }
    else { toast.error(data.error); }
  };

  const filtered = transactions.filter(t =>
    !search || (t.description || '').includes(search) || (t.category_name || '').includes(search) || t.account_name.includes(search)
  );

  const dialogTitle = editTxn ? '编辑交易' : '记一笔账';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">交易记录</h2>
          <p className="text-muted-foreground">{transactions.length} 条记录</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditTxn(null); }}>
          <DialogTrigger
            className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all"
            onClick={openNew}
          >
            <Plus className="w-4 h-4" />记一笔
          </DialogTrigger>
          <Button
            variant={listening ? 'destructive' : 'outline'}
            size="sm"
            onClick={startVoice}
            disabled={listening}
            className="h-8 gap-1.5"
          >
            {listening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
            {listening ? '聆听中...' : '语音'}
          </Button>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>类型</Label>
                <div className="flex gap-2 mt-1">
                  {(['expense', 'income', 'transfer'] as TransactionType[]).map(t => (
                    <button key={t}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${form.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                      onClick={() => setForm({ ...form, type: t })}
                    >
                      {txTypeConfig[t].icon}{txTypeConfig[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>金额 (¥)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>日期</Label>
                  <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                {form.type !== 'transfer' && (
                  <div>
                    <Label>分类</Label>
                    <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                      <SelectContent>
                        {(form.type === 'income' ? incomeCategories : expenseCategories).map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div>
                <Label>{form.type === 'transfer' ? '源账户' : '账户'}</Label>
                <Select value={form.account_id} onValueChange={v => setForm({ ...form, account_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="选择账户" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} (¥{a.balance})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'transfer' && (
                <div>
                  <Label>目标账户</Label>
                  <Select value={form.to_account_id} onValueChange={v => setForm({ ...form, to_account_id: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="选择目标账户" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => a.id !== Number(form.account_id)).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name} (¥{a.balance})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>备注</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="可选" />
              </div>
              <Button onClick={handleSubmit} disabled={saving} className="w-full">
                {saving ? '保存中...' : (editTxn ? '更新交易' : '确认记账')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="搜索交易描述、分类、账户..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {/* 交易列表 */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ArrowRightLeft className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>{search ? '未找到匹配的交易' : '还没有交易记录'}</p>
              <p className="text-sm mt-1">点击"记一笔"开始记录</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${txTypeConfig[t.type].color}`}>
                      {txTypeConfig[t.type].icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {t.description || t.category_name || txTypeConfig[t.type].label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.account_name}
                        {t.to_account_name && ` → ${t.to_account_name}`}
                        {' · '}{t.date}
                        {t.category_name && ` · ${t.category_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${
                      t.type === 'income' ? 'text-green-500' :
                      t.type === 'expense' ? 'text-red-500' : 'text-blue-500'
                    }`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                      {formatMoney(t.amount)}
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
