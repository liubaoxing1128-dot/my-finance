'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Upload, FileText, Shield } from 'lucide-react';
import { exportAllData, importAllData } from '@/lib/db-ops';
import { getDashboard, getMonthlyTrends, getCategorySpendings, getAllFunds } from '@/lib/db-ops';

const fmt = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export default function SettingsPage() {
  const [report, setReport] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // === 备份 ===
  const handleBackup = () => {
    try {
      const data = exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mimi-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('备份文件已下载');
    } catch { toast.error('备份失败'); }
  };

  // === 恢复 ===
  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!confirm('恢复数据将覆盖当前所有数据，确定继续？')) return;

        importAllData(data);
        toast.success('数据已恢复，请刷新页面');
      } catch { toast.error('无效的备份文件'); }
    };
    input.click();
  };

  // === 月度报告 ===
  const handleReport = () => {
    setReportLoading(true);
    try {
      const d = getDashboard() as any;
      const trends = getMonthlyTrends() as any[];
      const spendings = getCategorySpendings() as any[];
      const rawFunds = getAllFunds() as any[];

      const topCategory = spendings.slice(0, 3);

      // 计算基金汇总
      let totalInv = 0, totalMv = 0;
      for (const f of rawFunds) {
        totalInv += f.total_invested || 0;
        if (f.current_nav) totalMv += (f.total_shares || 0) * f.current_nav;
      }
      const fundData = rawFunds.length > 0 ? {
        total_invested: totalInv,
        total_market_value: totalMv,
        total_profit: totalMv - totalInv,
        total_profit_rate: totalInv > 0 ? ((totalMv - totalInv) / totalInv * 100) : 0,
      } : null;

      // 模板引擎生成报告
      const lines: string[] = [];
      lines.push(`📊 米米账本 月度报告`);
      lines.push(`生成时间：${new Date().toLocaleDateString('zh-CN')}`);
      lines.push(``);
      lines.push(`## 💰 资产概览`);
      lines.push(`- 总资产：${fmt(d.total_balance)}`);
      lines.push(`- 本月收入：${fmt(d.monthly_income)}`);
      lines.push(`- 本月支出：${fmt(d.monthly_expense)}`);
      lines.push(`- 本月结余：${fmt(d.monthly_balance)}（${d.monthly_income > 0 ? Math.round(d.monthly_balance / d.monthly_income * 100) : 0}%）`);
      lines.push(``);

      if (topCategory.length > 0) {
        lines.push(`## 🛒 支出排行`);
        topCategory.forEach((c: { name: string; amount: number }, i: number) => {
          const pct = d.monthly_expense > 0 ? Math.round(c.amount / d.monthly_expense * 100) : 0;
          const emoji = i === 0 ? '🔴' : i === 1 ? '🟠' : '🟡';
          lines.push(`${emoji} ${c.name}：${fmt(c.amount)}（占 ${pct}%）`);
        });
        lines.push(``);
      }

      if (d.monthly_balance > 0) {
        lines.push(`## 💡 本月亮点`);
        lines.push(`✅ 本月结余为正，收支健康！`);
      } else {
        lines.push(`## ⚠️ 本月注意`);
        lines.push(`🔴 本月入不敷出，建议检查支出项目。`);
      }

      if (fundData && fundData.total_invested > 0) {
        lines.push(``);
        lines.push(`## 📈 基金投资`);
        lines.push(`- 总投资：${fmt(fundData.total_invested)}`);
        lines.push(`- 当前市值：${fmt(fundData.total_market_value)}`);
        lines.push(`- 累计收益：${fmt(fundData.total_profit)}（${fundData.total_profit_rate.toFixed(2)}%）`);
        if (fundData.total_profit < 0) {
          lines.push(`- 📉 目前整体亏损，如果是定投可以继续坚持摊低成本`);
        } else {
          lines.push(`- 📈 整体盈利，表现不错！`);
        }
      }

      if (d.savings_progress > 0) {
        lines.push(``);
        lines.push(`## 🎯 储蓄进度`);
        lines.push(`- 平均完成度：${d.savings_progress}%`);
        if (d.savings_progress >= 80) lines.push(`- 即将达成目标，加油！`);
      }

      setReport(lines.join('\n'));
      setReportOpen(true);
    } catch { toast.error('生成报告失败'); }
    setReportLoading(false);
  };

  const copyReport = () => {
    if (report) { navigator.clipboard.writeText(report); toast.success('已复制到剪贴板'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground">数据管理 & 工具</p>
      </div>

      {/* 备份/恢复 */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold">数据备份与恢复</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            备份文件包含所有账户、交易、基金持仓和设置。建议定期备份。
          </p>
          <div className="flex gap-2">
            <Button onClick={handleBackup}><Download className="w-4 h-4 mr-1" />下载备份</Button>
            <Button variant="outline" onClick={handleRestore}><Upload className="w-4 h-4 mr-1" />恢复备份</Button>
          </div>
        </CardContent>
      </Card>

      {/* 月度报告 */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold">月度报告</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            自动分析本月收支、投资和储蓄情况，生成自然语言报告。
          </p>
          <Button onClick={handleReport} disabled={reportLoading}>
            {reportLoading ? '生成中...' : '生成本月报告'}
          </Button>
        </CardContent>
      </Card>

      {/* 报告弹窗 */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader><DialogTitle>月度报告</DialogTitle></DialogHeader>
          <div className="mt-2">
            <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-lg max-h-[60vh] overflow-y-auto font-sans">
              {report}
            </pre>
            <div className="flex gap-2 mt-4">
              <Button onClick={copyReport} variant="outline" className="flex-1">复制到剪贴板</Button>
              <Button onClick={() => setReportOpen(false)} className="flex-1">关闭</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
