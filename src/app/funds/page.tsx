'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Trash2, RefreshCw, Search, TrendingUp, TrendingDown,
  ChartLine, Loader2, MinusCircle, Clock, CalendarClock,
} from 'lucide-react';
import type {
  FundSearchResult, FundHoldingWithFund, FundSummary, FundType,
  AutoInvestWithFund, InvestFrequency,
} from '@/types';
import { FundTypeLabels, InvestFrequencyLabels } from '@/types';
import {
  getAllFunds, addFund as dbAddFund, deleteFund as dbDeleteFund,
  createFundHolding, deleteFundHolding, getFundHoldings, sellFund as dbSellFund,
  getAutoInvests, createAutoInvest as dbCreateAutoInvest,
  executeAutoInvest as dbExecInvest, deleteAutoInvest as dbDeletePlan,
  refreshFundNavs, searchFunds, updateFundNav,
  getAccounts,
} from '@/lib/db-ops';

const fmt = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
const pct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

interface FundCard {
  code: string; name: string; type: FundType; settlement: 1 | 2;
  current_nav: number | null; nav_date: string | null;
  total_shares: number; total_invested: number;
  market_value: number | null; profit: number | null; profit_rate: number | null;
  holdings: FundHoldingWithFund[];
}

export default function FundsPage() {
  const [funds, setFunds] = useState<FundCard[]>([]);
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<AutoInvestWithFund[]>([]);
  const [accounts, setAccounts] = useState<{ id: number; name: string; balance: number }[]>([]);

  // 弹窗状态
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKw, setSearchKw] = useState('');
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [buyOpen, setBuyOpen] = useState(false);
  const [buyFund, setBuyFund] = useState<FundCard | FundSearchResult | null>(null);
  const [buyForm, setBuyForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), fee: '0', timeOfDay: 'before' as 'before' | 'after' });

  const [sellOpen, setSellOpen] = useState(false);
  const [sellFund, setSellFund] = useState<FundCard | null>(null);
  const [sellForm, setSellForm] = useState({ shares: '', date: new Date().toISOString().slice(0, 10), fee: '0' });

  const [investOpen, setInvestOpen] = useState(false);
  const [investForm, setInvestForm] = useState({ fund_code: '', amount: '', frequency: 'monthly' as InvestFrequency, account_id: '', next_date: new Date().toISOString().slice(0, 10) });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // 基金列表、持仓、定投：从客户端 DB 读取
      const rawFunds = getAllFunds() as any[];
      const accts = getAccounts() as any[];
      const autoPlans = getAutoInvests() as unknown as AutoInvestWithFund[];
      setAccounts(accts);
      setPlans(autoPlans);

      // 如果有基金，从服务端拉最新净值（带缓存兜底）
      const codes = rawFunds.map((f: any) => f.code).join(',');
      let serverFundsMap: Record<string, any> = {};
      if (codes) {
        try {
          const resp = await fetch(`/api/funds/refresh?codes=${encodeURIComponent(codes)}`);
          const d = await resp.json();
          if (d.success && d.data.results) {
            for (const item of d.data.results) {
              serverFundsMap[item.code] = item;
              // 同步最新净值到客户端 DB
              updateFundNav(item.code, item.nav, item.date);
            }
          }
        } catch {}
      }

      const enriched = rawFunds.map((f: any) => {
        // 优先用服务端刚拉的最新净值，其次已缓存的
        const latestNav = serverFundsMap[f.code]?.nav ?? f.current_nav;
        const invested = f.total_invested;
        const shares = f.total_shares;
        const mv = latestNav ? shares * latestNav : null;
        const profit = mv !== null ? mv - invested : null;
        const profitRate = profit !== null && invested > 0 ? (profit / invested) * 100 : null;
        return { ...f, current_nav: latestNav ?? f.current_nav, shares, invested, market_value: mv, profit, profit_rate: profitRate, holdings: [] as FundHoldingWithFund[] };
      });

      // 加载持仓（从客户端 DB）
      const allHoldings = getFundHoldings() as unknown as FundHoldingWithFund[];
      const grouped: Record<string, FundHoldingWithFund[]> = {};
      for (const h of allHoldings) {
        if (!grouped[h.fund_code]) grouped[h.fund_code] = [];
        grouped[h.fund_code].push(h);
      }
      for (const f of enriched) f.holdings = grouped[f.code] || [];

      setFunds(enriched);

      const s: FundSummary = {
        total_invested: 0, total_market_value: 0, total_profit: 0, total_profit_rate: 0, fund_count: enriched.length,
      };
      for (const f of enriched) {
        s.total_invested += f.invested;
        if (f.market_value) s.total_market_value += f.market_value;
      }
      s.total_profit = s.total_market_value - s.total_invested;
      s.total_profit_rate = s.total_invested > 0 ? (s.total_profit / s.total_invested) * 100 : 0;
      setSummary(s);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // === 搜索 ===
  const handleSearch = async () => {
    if (!searchKw.trim()) return;
    setSearching(true);
    try {
      const data = await searchFunds(searchKw.trim());
      setSearchResults(data.data || []);
    } catch { toast.error('搜索失败'); }
    setSearching(false);
  };

  const addFund = (item: FundSearchResult) => {
    try {
      const settlement = item.type === 'qdi' ? 2 : 1;
      dbAddFund(item.code, item.name, item.type, settlement);
      toast.success(`已添加 ${item.name}`);
      setSearchResults(prev => prev.filter(r => r.code !== item.code));
      fetchAll();
    } catch { toast.error('添加失败'); }
  };

  // === 买入 ===
  const openBuy = (fund: FundCard | FundSearchResult) => {
    setBuyFund(fund);
    setBuyForm({ amount: '', date: new Date().toISOString().slice(0, 10), fee: '0', timeOfDay: 'before' });
    setBuyOpen(true);
  };

  const handleBuy = async () => {
    if (!buyFund || !buyForm.amount) { toast.error('请输入金额'); return; }
    let nav: number | null = null;

    // 直接从天天基金 API 拉这只基金的最新净值（通过服务端代理）
    try {
      const res = await fetch(`/api/funds/refresh?codes=${encodeURIComponent(buyFund.code)}`);
      const result = await res.json();
      if (result.success && result.data.results?.length > 0) {
        nav = result.data.results[0].nav;
        // 同步到客户端 DB
        updateFundNav(buyFund.code, nav!, result.data.results[0].date);
      }
    } catch {}

    if (!nav) { toast.error('无法获取最新净值，请确认网络连接后重试'); return; }

    const timeStr = buyForm.timeOfDay === 'before' ? '14:30:00' : '16:00:00';
    const tradeTime = buyForm.date + 'T' + timeStr;

    try {
      const result = createFundHolding({
        fund_code: buyFund.code, amount: Number(buyForm.amount), nav_at_purchase: nav,
        date: buyForm.date, fee: Number(buyForm.fee) || 0, trade_time: tradeTime,
      });
      toast.success(`买入成功 · 净值${nav.toFixed(4)} · 确认日${result.settlement_date}`);
      setBuyOpen(false); fetchAll();
    } catch { toast.error('买入失败'); }
  };

  // === 卖出 ===
  const openSell = (fund: FundCard) => {
    setSellFund(fund);
    setSellForm({ shares: '', date: new Date().toISOString().slice(0, 10), fee: '0' });
    setSellOpen(true);
  };

  const handleSell = async () => {
    if (!sellFund || !sellForm.shares) { toast.error('请输入卖出份额'); return; }
    let nav: number | null = null;
    try {
      const res = await fetch(`/api/funds/refresh?codes=${encodeURIComponent(sellFund.code)}`);
      const result = await res.json();
      if (result.success && result.data.results?.length > 0) {
        nav = result.data.results[0].nav;
        updateFundNav(sellFund.code, nav!, result.data.results[0].date);
      }
    } catch {}
    if (!nav) { toast.error('无法获取最新净值，请确认网络连接后重试'); return; }

    try {
      dbSellFund({
        fund_code: sellFund.code, shares: Number(sellForm.shares), nav_at_sell: nav!,
        date: sellForm.date, fee: Number(sellForm.fee) || 0,
      });
      toast.success(`卖出成功，到账 ${fmt(Number(sellForm.shares) * nav - Number(sellForm.fee || 0))}`);
      setSellOpen(false); fetchAll();
    } catch (e: any) { toast.error(e.message || '卖出失败'); }
  };

  // === 定投 ===
  const openInvest = (fundCode?: string) => {
    setInvestForm({
      fund_code: fundCode || '', amount: '', frequency: 'monthly',
      account_id: accounts[0]?.id?.toString() || '', next_date: new Date().toISOString().slice(0, 10),
    });
    setInvestOpen(true);
  };

  const handleInvest = async () => {
    if (!investForm.fund_code || !investForm.amount || !investForm.account_id) {
      toast.error('请填写完整信息'); return;
    }
    try {
      dbCreateAutoInvest(investForm);
      toast.success('定投计划已创建'); setInvestOpen(false); fetchAll();
    } catch { toast.error('创建失败'); }
  };

  const execInvest = (id: number) => {
    if (!confirm('确定执行本期定投吗？将从关联账户扣款。')) return;
    try {
      const data = dbExecInvest(id);
      toast.success(`定投执行成功`);
      fetchAll();
    } catch (e: any) { toast.error(e.message || '执行失败'); }
  };

  const deletePlan = (id: number) => {
    if (!confirm('确定删除这个定投计划吗？')) return;
    dbDeletePlan(id);
    toast.success('已删除'); fetchAll();
  };

  const refreshAllNav = async () => {
    setRefreshing(true);
    try {
      const data = await refreshFundNavs();
      if (data.success) { toast.success(`已更新 ${data.data.updated} 只基金净值`); fetchAll(); }
    } catch { toast.error('刷新失败'); }
    setRefreshing(false);
  };

  const deleteHolding = (id: number) => {
    if (!confirm('确定删除这条买入记录吗？')) return;
    deleteFundHolding(id);
    toast.success('已删除'); fetchAll();
  };

  const deleteFund = (code: string) => {
    if (!confirm('确定删除这只基金吗？')) return;
    dbDeleteFund(code);
    toast.success('已删除'); fetchAll();
  };

  const settlementLabel = (s: 1 | 2) => s === 1 ? 'T+1' : 'T+2';

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">基金持仓</h2>
          {summary && (
            <p className="text-muted-foreground text-sm">
              {summary.fund_count} 只 · 市值 {fmt(summary.total_market_value)} · 收益{' '}
              <span className={summary.total_profit >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                {pct(summary.total_profit_rate)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAllNav} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />刷新净值
          </Button>
          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 text-sm font-medium transition-all">
              <Plus className="w-4 h-4" />添加基金
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>搜索基金</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex gap-2">
                  <Input value={searchKw} onChange={e => setSearchKw(e.target.value)}
                    placeholder="输入基金代码或名称" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                  <Button onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {searchResults.map(item => (
                    <div key={item.code} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.code} · {FundTypeLabels[item.type]}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addFund(item)}>跟踪</Button>
                    </div>
                  ))}
                  {searchResults.length === 0 && searchKw && !searching && (
                    <p className="text-sm text-muted-foreground text-center py-4">未找到</p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 汇总卡片 */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ['投资总额', fmt(summary.total_invested), ''],
            ['当前市值', fmt(summary.total_market_value), ''],
            ['累计盈亏', fmt(summary.total_profit), summary.total_profit >= 0 ? 'text-green-500' : 'text-red-500'],
            ['收益率', pct(summary.total_profit_rate), summary.total_profit_rate >= 0 ? 'text-green-500' : 'text-red-500'],
          ] as [string, string, string][]).map(([label, value, color]) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 基金列表 */}
      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <Card key={i}><CardContent className="p-6 h-32 animate-pulse" /></Card>)}</div>
      ) : funds.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <ChartLine className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>还没有添加基金</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {funds.map(fund => (
            <Card key={fund.code}>
              <CardContent className="p-5">
                {/* 基金信息 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <ChartLine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{fund.name}</h3>
                        <Badge variant="secondary" className="text-xs">{FundTypeLabels[fund.type]}</Badge>
                        <Badge variant="outline" className="text-xs">{settlementLabel(fund.settlement)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {fund.code}
                        {fund.current_nav && ` · 净值 ${fund.current_nav.toFixed(4)}`}
                        {fund.nav_date && ` (${fund.nav_date})`}
                      </p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => deleteFund(fund.code)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* 汇总 */}
                <div className="grid grid-cols-4 gap-3 mb-3 p-3 bg-muted/50 rounded-lg">
                  {([
                    ['持有份额', fund.total_shares.toFixed(2)],
                    ['成本', fmt(fund.total_invested)],
                    ['市值', fund.market_value != null ? fmt(fund.market_value) : '—'],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="text-sm font-semibold">{v}</p></div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground">收益</p>
                    <p className={`text-sm font-semibold flex items-center gap-0.5 ${fund.profit_rate != null ? (fund.profit_rate >= 0 ? 'text-green-500' : 'text-red-500') : ''}`}>
                      {fund.profit_rate != null ? <>{fund.profit_rate >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{pct(fund.profit_rate)}</> : '—'}
                    </p>
                  </div>
                </div>

                {/* 持仓明细 */}
                {fund.holdings.length > 0 && (
                  <div className="text-xs space-y-1.5 mb-3">
                    <p className="text-muted-foreground font-medium">持仓明细</p>
                    {fund.holdings.map(h => (
                      <div key={h.id} className="flex items-center justify-between py-1.5 border-t border-border/50 gap-2">
                        <span>{h.date}</span>
                        <span className="text-muted-foreground">{((h.shares - h.sold_shares)).toFixed(2)}/{h.shares.toFixed(2)}份</span>
                        <span className="text-muted-foreground hidden sm:inline">
                          <Clock className="w-3 h-3 inline mr-0.5" />{h.settlement_date}
                        </span>
                        {h.profit_rate != null && (
                          <span className={h.profit_rate >= 0 ? 'text-green-500' : 'text-red-500'}>{pct(h.profit_rate)}</span>
                        )}
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive shrink-0" onClick={() => deleteHolding(h.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-3 border-t">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openBuy(fund)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />买入
                  </Button>
                  {fund.total_shares > 0 && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openSell(fund)}>
                      <MinusCircle className="w-3.5 h-3.5 mr-1" />卖出
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => openInvest(fund.code)}>
                    <CalendarClock className="w-3.5 h-3.5 mr-1" />定投
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 定投计划列表 */}
      {plans.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3">定投计划</h3>
            <div className="space-y-2">
              {plans.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <CalendarClock className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{p.fund_name} · {fmt(p.amount)}/{InvestFrequencyLabels[p.frequency]}</p>
                      <p className="text-xs text-muted-foreground">
                        扣款: {p.account_name} · 下次: {p.next_date}
                        {p.current_nav && ` · 净值 ${p.current_nav.toFixed(4)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {p.status === 'active' ? '进行中' : p.status === 'paused' ? '已暂停' : '已停止'}
                    </Badge>
                    {p.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => execInvest(p.id)}>执行</Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePlan(p.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === 买入弹窗 === */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>买入 - {buyFund?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>买入金额 (¥)</Label>
              <Input type="number" step="0.01" value={buyForm.amount}
                onChange={e => setBuyForm({ ...buyForm, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>日期</Label>
                <Input type="date" value={buyForm.date} onChange={e => setBuyForm({ ...buyForm, date: e.target.value })} />
              </div>
              <div>
                <Label>手续费 (¥)</Label>
                <Input type="number" step="0.01" value={buyForm.fee}
                  onChange={e => setBuyForm({ ...buyForm, fee: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>下单时间</Label>
              <div className="flex gap-2 mt-1">
                {(['before', 'after'] as const).map(t => (
                  <button key={t}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${buyForm.timeOfDay === t ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted'}`}
                    onClick={() => setBuyForm({ ...buyForm, timeOfDay: t })}
                  >
                    {t === 'before' ? '☀️ 15:00 前' : '🌙 15:00 后'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {buyForm.timeOfDay === 'before' ? '按当日净值确认，T+1/T+2 到账' : '按下一交易日净值确认'}
              </p>
            </div>
            <Button onClick={handleBuy} className="w-full">确认买入</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === 卖出弹窗 === */}
      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>卖出 - {sellFund?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              可卖份额: {sellFund?.total_shares.toFixed(2) ?? 0} 份 · 当前净值: {sellFund?.current_nav?.toFixed(4) ?? '—'}
            </p>
            <div>
              <Label>卖出份额</Label>
              <Input type="number" step="0.01" value={sellForm.shares}
                onChange={e => setSellForm({ ...sellForm, shares: e.target.value })} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>日期</Label>
                <Input type="date" value={sellForm.date} onChange={e => setSellForm({ ...sellForm, date: e.target.value })} />
              </div>
              <div>
                <Label>手续费 (¥)</Label>
                <Input type="number" step="0.01" value={sellForm.fee}
                  onChange={e => setSellForm({ ...sellForm, fee: e.target.value })} placeholder="0" />
              </div>
            </div>
            {sellForm.shares && sellFund?.current_nav && (
              <p className="text-sm text-green-500">
                预计到账: {fmt(Number(sellForm.shares) * sellFund.current_nav - Number(sellForm.fee || 0))}
              </p>
            )}
            <Button onClick={handleSell} className="w-full">确认卖出</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === 定投弹窗 === */}
      <Dialog open={investOpen} onOpenChange={setInvestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>创建定投计划</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>基金</Label>
              <Select value={investForm.fund_code} onValueChange={v => setInvestForm({ ...investForm, fund_code: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="选择基金" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => (
                    <SelectItem key={f.code} value={f.code}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>每期金额 (¥)</Label>
              <Input type="number" step="0.01" value={investForm.amount}
                onChange={e => setInvestForm({ ...investForm, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>频率</Label>
                <Select value={investForm.frequency} onValueChange={v => setInvestForm({ ...investForm, frequency: v as InvestFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(InvestFrequencyLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>扣款账户</Label>
                <Select value={investForm.account_id} onValueChange={v => setInvestForm({ ...investForm, account_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="选择账户" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} (¥{a.balance})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>首次执行日期</Label>
              <Input type="date" value={investForm.next_date}
                onChange={e => setInvestForm({ ...investForm, next_date: e.target.value })} />
            </div>
            <Button onClick={handleInvest} className="w-full">创建定投</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
