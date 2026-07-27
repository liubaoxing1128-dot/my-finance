# 米米账本 (Mimi Finance) — 项目交接文档

> 生成时间：2026-07-27  
> 写给：下一次打开这个项目的 Claude Code（无上下文时）

---

## 一、项目概述

**米米账本** 是一个个人理财 App，目标是给家人（爸妈）使用，最终上架手机应用商店。

当前技术栈：
- Next.js 16 (App Router) + React 19 + TypeScript
- SQLite (node:sqlite) — 本地数据库
- Tailwind CSS v4 + shadcn UI (Base UI 变体)
- Recharts 图表库 / Zustand 状态管理
- PWA 支持（manifest + Service Worker）

当前运行方式：
- 本地开发：`npm run dev` → `http://localhost:3000`
- 手机同 WiFi 访问：`http://192.168.1.30:3000`
- 已部署 Vercel：`https://my-finance-eta-two.vercel.app`（需 VPN）

---

## 二、已完成功能

### 1. 仪表盘 (`/`)
- 统计卡片：总资产、本月收入、本月支出、本月结余
- 近 6 月收支趋势柱状图
- 本月支出分类饼图
- 最近 5 条交易 + 账户概览

### 2. 账户管理 (`/accounts`)
- 支持银行、支付宝、微信、现金等类型
- 增删改查，颜色标识，卡片式展示
- 余额自动随交易变动

### 3. 交易记录 (`/transactions`)
- 收入、支出、转账三种类型
- 增删改查（编辑含 PUT API，自动回滚旧余额变动）
- 搜索过滤
- **🎤 语音记账**：Web Speech API，支持中文数字（二十五、一百五）和阿拉伯数字

### 4. 分类管理 (`/categories`)
- 收入/支出分类分开显示
- 增删改查，颜色选择器

### 5. 基金持仓 (`/funds`) ⭐
- **搜索基金**：调用天天基金 API 搜索代码/名称
- **添加跟踪**：自动识别基金类型 + T+1/T+2 结算
- **买入**：选择 15:00 前/后 → 自动算确认日期，拉取最新净值
- **卖出**：先进先出 (FIFO) 匹配持仓批次，金额回账户余额
- **定投**：选基金/金额/频率/扣款账户 → 一键执行 → 自动扣款+买入+更新下次日期
- **刷新净值**：批量拉取天天基金最新净值
- 汇总卡片：投资总额、市值、盈亏、收益率
- 支持 T+1（境内）和 T+2（QDII）

### 6. 预算管理 (`/budget`)
- 按月设定各分类预算上限
- 进度条 + 超支提醒
- 月份筛选器

### 7. 储蓄目标 (`/savings`)
- 增删改查，进度条
- 存入一笔，自动判断达成

### 8. 设置 (`/settings`)
- **数据备份**：一键导出 JSON 文件
- **数据恢复**：上传 JSON 文件恢复
- **月度报告**：模板引擎自动生成自然语言财务报告

### 9. UI 体验
- 暗色模式切换
- 移动端响应式：小屏自动切换顶部导航 + 抽屉菜单
- PWA：manifest + Service Worker + 图标
- iPhone 安全区适配

### 10. Git & 部署
- GitHub：`https://github.com/liubaoxing1128-dot/my-finance`
- Vercel：`https://my-finance-eta-two.vercel.app`（需 VPN）
- 每次代码改动会自动 push

---

## 三、当前待解决

### 🔴 核心问题：国内无法直接访问

Vercel 被墙，爸妈打不开。当前讨论的解决方案是 **客户端模式改造**：

**目标**：把数据库从服务端 SQLite 迁到浏览器内运行，让 App 完全离线可用。

**具体要做**：
- 将 node:sqlite 换成浏览器内的 SQLite（OPFS — Origin Private File System）
- 所有 CRUD API 改成浏览器内直接操作数据库
- 基金搜索和净值刷新这 2 个联网功能保留 Vercel API 代理（偶尔连一下）
- Vercel 部署变成纯静态文件托管 + 一个轻量 API 代理

**改造成本**：中等（API 层重写，UI 不变，类型/页面复用）

### 🟡 技术限制

- shadcn UI 当前版本用的是 **Base UI** 不是 Radix，导致：
  - 没有 `asChild` 属性
  - DialogTrigger 自己渲染 `<button>`，不能嵌套 `<Button>`
  - 解决方法：直接在 Trigger 上加 className 样式，不套 Button

- Recharts v3 类型变更：formatter 参数类型变了，需要 `Number(value)` 转换

---

## 四、下一步计划

| 优先级 | 任务 | 说明 |
|--------|------|------|
| ⭐ P0 | 客户端模式改造 | 浏览器 SQLite 替代 node:sqlite |
| P1 | 云端同步 | 登录系统 + 远程数据库，多设备同步 |
| P2 | Capactor 打包 | 上架 App Store / Google Play |
| P3 | 阿里云部署 | 买服务器+域名，国内直连 |

---

## 五、关键文件索引

| 文件 | 作用 |
|------|------|
| `src/lib/db.ts` | 数据库 schema + 种子数据 |
| `src/types/index.ts` | 所有 TypeScript 类型 |
| `src/stores/app-store.ts` | Zustand 全局状态 |
| `src/app/page.tsx` | 仪表盘 |
| `src/app/funds/page.tsx` | 基金持仓（最复杂的页面） |
| `src/app/api/` | API 路由（按资源分目录） |
| `src/components/layout/sidebar.tsx` | 侧边栏（桌面+移动端） |
| `public/manifest.json` | PWA 配置 |
| `public/sw.js` | Service Worker |

## 六、常用命令

```bash
npm run dev        # 开发模式启动
npx next build     # 生产构建
npx next start     # 生产模式启动

git add -A && git commit -m "msg" && git push   # 提交推送
```

**Git 代理配置**：已设 http.proxy = 127.0.0.1:33210

---

## 七、对话历史摘要

本会话做了以下工作：
1. 修复了所有页面的 TypeScript 编译错误
2. 补全了交易编辑、预算删除、储蓄编辑、分类管理
3. 加了暗色模式 + 移动端响应式侧边栏
4. 加了 PWA 支持（manifest + SW + 图标）
5. 修复了移动端 z-index 遮挡、按钮嵌套等问题
6. 完整实现了基金持仓系统（搜索/买入/卖出/定投/净值刷新）
7. 加了数据备份恢复 + 月度报告模板引擎
8. 加了语音记账
9. 初始化 Git + 推送到 GitHub
10. 部署 Vercel（需 VPN 访问）
11. 更名为"米米账本"
12. 讨论了客户端模式改造方案（待实施）
