# 球译 · 2026 FIFA World Cup 竞彩数据资讯平台

> 面向中国用户的 2026 美加墨世界杯数据工具站，提供赛程速览、赔率分析、AI 深度推演、积分竞猜等功能。

**线上地址：** https://jingcai-beta.vercel.app

---

## 项目亮点

### 1. 全栈独立开发
Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (PostgreSQL)，从产品设计到上线全程一人完成。

### 2. AI 深度推演系统
- 接入 DeepSeek API，基于赛前数据（历史战绩、阵容实力、赔率结构）生成多维度分析报告
- Server-Sent Events (SSE) 流式输出，10步推演实时推进，含150s超时兜底与 keepalive 心跳
- 比分热力图、总进球概率分布、晋级路线树可视化

### 3. 双源赔率数据管线
- **境内数据：** 阿里云函数计算（大陆IP）定时抓取中国体彩官方赔率 → POST 香港服务器 → 解析入库 Supabase
- **降级兜底：** Vercel/境外环境自动切换 DB 缓存重建，支持胜平负/让球/总进球/比分四种玩法
- 严格合规：仅使用体彩官方数据源（webapi.sporttery.cn），零境外博彩盘口

### 4. 快讯自动聚合
- GitHub Actions 每6小时抓取 BBC Sport、ESPN、FIFA、新浪体育等多源 RSS
- DeepSeek 自动过滤世界杯相关内容并生成中文摘要
- 快讯数据可注入 AI 推演上下文，增强分析背景

### 5. 积分竞猜系统
- 设备级访客身份（无需注册），localStorage UUID 绑定 Supabase profile
- 赛前锁定官方赔率倍数，赛后自动结算，全程零真实货币通道
- 签到积分、积分解锁深度预测、实时排行榜

### 6. 会员激活码系统
- Pro/Max 双档位，后台批量生成、勾选复制导出
- 激活码校验、有效期管理、使用记录追踪

---

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                  用户层 (Vercel CDN / 香港服务器)          │
│    Next.js 16 App Router · Tailwind 4 · TypeScript      │
└────────────────────────┬────────────────────────────────┘
                         │
           ┌─────────────┼──────────────┐
           ▼             ▼              ▼
     Supabase DB    DeepSeek AI   football-data.org
    (PostgreSQL)  (推演/快讯摘要)   (赛程/比分)
           ▲
           │ /api/odds/ingest
    阿里云 FC 函数计算（大陆 IP）
           ↑
    webapi.sporttery.cn（中国体彩官方）
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 16 (App Router, Turbopack) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4（自定义设计令牌系统）|
| 数据库 | Supabase (PostgreSQL + RLS) |
| AI | DeepSeek API (OpenAI 兼容接口) |
| 部署 | Vercel (sin1) + 腾讯云香港轻量服务器 + PM2 |
| 定时任务 | cron-job.org + GitHub Actions |
| 大陆数据采集 | 阿里云函数计算 FC |
| 流式输出 | Server-Sent Events (SSE) |

## 主要页面

| 路由 | 功能 |
|---|---|
| `/` | 首页：赛程速览、公告横幅、快讯 |
| `/matches` | 赛程列表，按小组/状态筛选 |
| `/match/[id]` | 单场详情：AI报告、深度推演、赔率解读 |
| `/odds` | 赔率工具：胜平负/让球/总进球/比分 |
| `/calculator` | 竞彩计算器：单关/串关 |
| `/games` | 积分竞猜：赛前预测，赛后自动结算 |
| `/news` | 世界杯快讯：多源自动聚合 |
| `/deduction` | AI 深度推演（SSE 流式）|
| `/admin/*` | 后台：公告、激活码、快讯管理 |

## 本地运行

```bash
npm install
cp .env.example .env.local  # 填入环境变量
npm run dev
```

---

## 关于

独立开发者，在校期间完成此项目，涵盖产品设计、前后端开发、云部署、AI 接入全流程。

> 本项目严格遵守合规要求：仅展示官方数据源，不提供投注建议，不接入境外赔率，不承诺任何收益预测。
