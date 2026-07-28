import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // 跳过 API 路由的静态生成（运行时不可用，但浏览器端已独立运行）
  images: { unoptimized: true },
};

export default nextConfig;
