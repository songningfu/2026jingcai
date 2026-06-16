<div align="center">

# ⚽ 球译 · WC2026

**面向中国球迷的 2026 美加墨世界杯数据资讯与工具平台**

赛程速览 · 官方赔率解读 · AI 深度推演 · 实时快讯 · 积分竞猜

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

**线上地址 →** [songningfu.site](https://songningfu.site/)

</div>

---

## 这是什么

「球译」是一个**数据资讯与效率工具站**——把世界杯的赛程、官方赔率、阵容数据和赛事资讯整理清楚，再用大模型从概率学角度拆解每一场球。

> 卖的是**信息和效率**，不是「帮人赢钱」。全站零下单入口、零博彩外链、不提供任何投注建议。

合规不是事后补丁，而是贯穿始终的设计约束（详见 [设计原则](#-设计原则合规优先)）。

---

## ✨ 功能亮点

### 🤖 AI 深度推演
- 接入 OpenAI 兼容的大模型接口，综合历史战绩、阵容实力、近期状态与赔率结构生成结构化分析报告
- **Server-Sent Events 流式输出**：11 步推演实时推进，含超时兜底与 keepalive 心跳
- 自研概率模型 `deep-model`：赔率去水位 → 双变量泊松 → Dixon-Coles 低比分修正 → 8×8 比分矩阵 → 聚合赛果区间概率
- 比分热力图、总进球分布、晋级路线树等可视化呈现

### 📊 双源赔率数据管线
- **境内采集**：阿里云函数计算（大陆 IP）定时抓取中国体彩官方赔率 → POST 香港服务器 → 解析入库
- **降级兜底**：境外环境自动切换 DB 缓存重建，保证 `/calculator` 始终可用
- 严格只用体彩官方数据源（`webapi.sporttery.cn`），**零境外博彩盘口**

### ⚡ 快讯自动聚合
- 定时任务每日早间抓取 BBC Sport、ESPN 等多源 RSS
- 大模型自动筛选世界杯相关内容、**翻译为中文并改写为可读摘要**
- 经禁用词过滤后入库，前端可展开阅读、无需跳转原文

### 🎯 积分竞猜
- **设备级访客身份**（无需注册）：localStorage UUID 绑定 Supabase profile
- 赛前按官方赔率锁定倍数，赛后自动结算，**全程零真实货币通道**
- 每日签到、积分解锁深度预测、实时排行榜，所有积分变动写流水审计

### 🛠 赔率工具
- 隐含概率换算（归一化 + 返还率）、串关总赔率、M 串 N 复式注数（对称多项式 DP）
- EV / 凯利价值指标，纯客户端计算

### 🔐 会员激活码后台
- Pro / Max 双档位，后台批量生成、勾选导出
- 激活码校验、有效期与使用记录追踪（支付资质就绪前的手动开通方案）

---

## 🏗 技术架构

```
┌──────────────────────────────────────────────────────────┐
│            用户层 · Vercel CDN (sin1) / 腾讯云香港          │
│        Next.js 16 App Router · Tailwind 4 · TypeScript     │
└───────────────────────────┬──────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
    Supabase DB        大模型 API        football-data.org
   (PostgreSQL+RLS)   (推演/快讯摘要)      (赛程/比分)
          ▲
          │ POST /api/odds/ingest
   阿里云 FC 函数计算（大陆 IP，每 10 min）
          ▲
          │ 抓取（需完整请求头过 WAF）
   webapi.sporttery.cn（中国体彩官方）
```

**为什么要绕一圈？** 中国体彩官网只认大陆 IP，Vercel / 香港机房直连会被拒。因此由大陆的阿里云函数计算抓取原始数据，再转发给香港服务器解析入库——既拿到官方数据，又满足境内访问的低延迟需求。

## 🧰 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 16（App Router · Turbopack） |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS 4（自定义设计令牌「简白数据纸」主题） |
| 数据库 | Supabase（PostgreSQL + Row Level Security） |
| AI | 大模型 API（OpenAI 兼容接口） |
| 流式输出 | Server-Sent Events (SSE) |
| 部署 | Vercel + 腾讯云香港轻量服务器（PM2 + Nginx） |
| 定时任务 | cron-job.org（分钟级 / 每日级触发） |
| 大陆数据采集 | 阿里云函数计算 FC |

## 🗺 主要页面

| 路由 | 功能 |
|---|---|
| `/` | 首页：下一场倒计时、赛程速览、快讯、今日比赛 |
| `/matches` | 赛程列表，按小组 / 状态筛选，比分实时刷新 |
| `/match/[id]` | 单场详情：小组积分榜、双方大名单、AI 报告 |
| `/deduction` | AI 深度推演（SSE 流式）+ 赛事关系图谱 |
| `/calculator` | 赔率工具：隐含概率 / 串关 / 复式注数 |
| `/news` | 世界杯快讯：多源自动聚合，中文摘要 |
| `/games` | 积分竞猜：赛前预测，赛后自动结算 |
| `/pricing` `/account` | 订阅档位 / 账户与激活码兑换 |
| `/admin/*` | 后台：公告、激活码、快讯、数据管理 |

---

## 🚀 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local   # 填入你的 Supabase / 大模型 / football-data 密钥

# 3. 初始化数据库
#    在 Supabase SQL Editor 依次执行 supabase/schema.sql
#    及 supabase/migrations/ 下的增量迁移

# 4. 启动开发服务器
npm run dev                  # → http://localhost:3000
```

### 常用脚本

```bash
npm run build                # 生产构建（提交前必须通过）
npm run import:squads:dry    # 校验 48 队球员名单导入（只读）
npm run import:squads        # 执行导入

# 手动触发定时任务（口令为 .env.local 中的 CRON_SECRET）
curl "http://localhost:3000/api/sync?secret=$CRON_SECRET"            # 同步赛程/比分
curl "http://localhost:3000/api/news/sync?secret=$CRON_SECRET"       # 抓取并翻译快讯
curl "http://localhost:3000/api/reports/generate?secret=$CRON_SECRET" # 生成 AI 报告
```

---

## 🛡 设计原则（合规优先）

本项目面向中国市场，把法律边界作为第一约束。核心红线：

- **永不输出投注结论或倾向** —— AI 与界面只做描述与分析
- **零下单入口、零博彩外链、零代购代投**
- **赔率仅取中国体彩竞彩官方来源**，禁用任何境外博彩盘口
- **虚拟积分不可充值 / 提现 / 兑换现金等价物** —— 不存在任何 points ↔ money 通道
- **不承诺任何准确率 / 胜率 / 收益**
- 所有 AI 生成内容入库前必经 `filterContent()` 禁用词过滤
- 概率 / 赔率展示处固定附带免责声明

---

## 📁 目录结构（核心）

```
src/
├── app/                 # 页面与 API 路由（App Router）
│   ├── api/             #   ├ sync / odds / reports / deep / news / games ...
│   ├── match/[id]/      #   ├ 单场详情
│   └── deduction/       #   └ AI 推演 + 关系图谱
├── components/          # UI 组件（NewsFlash / TournamentGraph ...）
└── lib/
    ├── odds.ts          # 概率/串关/组合数纯函数 + DISCLAIMER
    ├── banned-terms.ts  # 禁用词过滤（含安全词白名单）
    ├── deep-model.ts    # 自研比分概率模型
    ├── sporttery.ts     # 竞彩官方赔率接入（唯一合法赔率源）
    ├── football-data.ts # 赛程/比分客户端（限频缓存）
    └── ai.ts            # 大模型调用（OpenAI 兼容）
supabase/
├── schema.sql           # 全部建表 SQL + RLS
└── migrations/          # 增量迁移
```

---

## 👤 关于

独立开发者在校期间完成的个人项目，涵盖**产品设计、前后端开发、云部署、AI 接入、合规设计**全流程。

<div align="center">

*本项目严格遵守合规要求：仅展示官方数据源，不提供投注建议，不接入境外赔率，不承诺任何收益预测。*

</div>
