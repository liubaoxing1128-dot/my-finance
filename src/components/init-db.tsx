'use client';

import { useEffect, useState } from 'react';
import { initClientDb } from '@/lib/client-db';
import { Loader2 } from 'lucide-react';

export function InitDbProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    initClientDb()
      .then(() => setReady(true))
      .catch((e) => setError('数据库初始化失败: ' + e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold text-red-500 mb-2">初始化失败</p>
          <p className="text-sm text-muted-foreground break-all">{error}</p>
          <p className="text-xs text-muted-foreground mt-4">
            请确保使用 Chrome/Edge 浏览器，并允许存储权限
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">正在初始化数据库...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
