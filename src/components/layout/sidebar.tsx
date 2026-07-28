'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard, Wallet, ArrowLeftRight, PiggyBank, ChartNoAxesGantt,
  Banknote, Tags, Sun, Moon, Menu, ChartLine, Settings,
} from 'lucide-react';
import { useEffect } from 'react';

const navItems = [
  { href: '/', label: '仪表盘', icon: LayoutDashboard },
  { href: '/accounts', label: '账户管理', icon: Wallet },
  { href: '/transactions', label: '交易记录', icon: ArrowLeftRight },
  // { href: '/funds', label: '基金持仓', icon: ChartLine },  // 暂时隐藏，代码保留
  { href: '/categories', label: '分类管理', icon: Tags },
  { href: '/savings', label: '储蓄目标', icon: PiggyBank },
  { href: '/budget', label: '预算管理', icon: ChartNoAxesGantt },
  { href: '/settings', label: '设置', icon: Settings },
];

function NavContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-4 space-y-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function SidebarLogo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
        <Banknote className="w-5 h-5 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-lg font-bold tracking-tight">米米账本</h1>
        <p className="text-xs text-muted-foreground">个人财务管理</p>
      </div>
    </Link>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 路由变化时关闭移动端侧边栏
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      {/* 移动端：顶部导航栏 */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 flex items-center justify-between px-4"
        style={{
          height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
          >
            <Menu className="w-5 h-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <div className="p-6 border-b">
              <SidebarLogo />
            </div>
            <NavContent onNavClick={() => setOpen(false)} />
            <div className="p-4 border-t flex items-center justify-between">
              <p className="text-xs text-muted-foreground">数据本地存储 · 安全可靠</p>
              <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Banknote className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">米米账本</span>
        </Link>

        <ThemeToggle />
      </header>


      {/* 桌面端：固定侧边栏 */}
      <aside className="hidden lg:flex w-64 border-r bg-card flex-col h-screen sticky top-0">
        <div className="p-6 border-b">
          <SidebarLogo />
        </div>
        <NavContent />
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">数据本地存储 · 安全可靠</p>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
