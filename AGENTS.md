<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 「球译」竞彩数据资讯平台 — AI 协作指引

> 给所有在本仓库工作的 AI 编码助手。**动手前先读完本文件**，尤其是「红线」一节。

## 这是什么项目

面向中国用户的 2026 世界杯**数据资讯与工具站**，卖的是「信息和效率」，不是「帮人赢钱」。
两份必读文档（在上级目录 `../`）：

- `../竞彩资讯平台_开发规格文档.md` — 产品规格，**第 0 章红线是一切功能的验收标准**
- `../项目进度.md` — 当前进度（已实现/未实现/下一步）。**你完成任何功能后必须同步更新它**

## 🚫 红线（违反 = 直接返工，无例外）

1. **永远不输出投注结论/倾向**。禁止「推荐/看好/稳/必中/跟单/上车/这场买X」等。AI 和界面只做描述与分析。
2. **零下单入口、零博彩外链、零代购代投**。
3. 所有概率/赔率展示旁必须带固定免责声明 —— 用 `src/lib/odds.ts` 导出的 `DISCLAIMER` 常量，不要自己写。
4. **赔率只用中国体彩竞彩官方来源**（`webapi.sporttery.cn`），禁止任何境外博彩公司盘口。
5. 虚拟积分（profiles.points）**不可充值、不可提现、不可兑换现金等价物**。不实现任何 points↔money 通道。
6. 全站不承诺准确率/胜率/收益。
7. **一切 AI 生成内容入库/展示前必须过 `src/lib/banned-terms.ts` 的 `filterContent()`**，已有管线照抄 `src/lib/reports.ts` 的做法。
8. 支付：资质未就绪，**不要接任何收款**（规格 8.3）。当前所有内容免费（`is_premium=false`）。

## 技术栈与架构

Next.js 16（App Router, Turbopack）+ TypeScript + Tailwind 4 + Supabase (Postgres)。

```
数据流：
football-data.org ──(GET /api/sync, 60s缓存)──→ Supabase teams/matches
webapi.sporttery.cn ─(lib/sporttery.ts, 服务端取数)──→ /odds 页 + 计算器带入
Supabase 数据 ──(GET /api/reports/generate)──→ DeepSeek ──filterContent──→ reports 表
```

### 目录地图（src/）

| 路径 | 职责 |
|---|---|
| `lib/odds.ts` | 概率/串关/组合数纯函数 + `DISCLAIMER` 常量 |
| `lib/banned-terms.ts` | 禁用词表 + `filterContent()` 后置过滤（含安全词白名单） |
| `lib/football-data.ts` | football-data.org 客户端（限频 10/min，靠 `next: { revalidate: 60 }` 兜住，**不要绕过缓存**） |
| `lib/sporttery.ts` / `sporttery-types.ts` | 竞彩官方赔率接入（唯一合法赔率源） |
| `lib/sporttery-sync.ts` | 官方赔率 → `odds` 表（含队名别名匹配），入口 `/api/odds/sync` |
| `scripts/import-worldcup-squads.mjs` | 48 队球员名单导入（emrbli/worldcup 数据，`npm run import:squads[:dry]`） |
| `docs/data-sources.md` | 数据源接入策略与验证记录，接新数据源前先读 |
| `supabase/migrations/` | 增量迁移 SQL（与 schema.sql 同步维护） |
| `lib/sync.ts` | 赛程/比分 → Supabase upsert |
| `lib/reports.ts` | AI 报告管线（固定 prompt，**约束部分勿改**；可补充背景事实） |
| `lib/ai.ts` | DeepSeek 调用（OpenAI 兼容，JSON 输出） |
| `lib/supabase.ts` | `supabaseAdmin()`，service_role，**仅服务端**（有 server-only 保护） |
| `lib/cron-auth.ts` | API 路由口令校验，所有 cron 型路由必须用它 |
| `lib/team-names.ts` | 48 队英文→中文映射 |
| `app/matches` `app/match/[id]` `app/calculator` `app/odds` | 页面 |
| `app/api/sync` `app/api/reports/generate` | 定时任务入口 |
| `supabase/schema.sql` | 全部建表 SQL（8 表 + RLS），改表结构要同步改这个文件 |

## 环境变量（`.env.local`，已 gitignore，勿提交勿打印）

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）/ `FOOTBALL_DATA_TOKEN` / `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` / `CRON_SECRET`

## 常用命令

```bash
npm run dev          # 开发服务器 :3000
npm run build        # 构建（提交前必须通过）
# 同步赛程比分（口令在 .env.local 的 CRON_SECRET）
curl "http://localhost:3000/api/sync?secret=$CRON_SECRET"
# 批量生成未来48h缺失报告（最多5场）/ 指定单场
curl "http://localhost:3000/api/reports/generate?secret=$CRON_SECRET"
curl "http://localhost:3000/api/reports/generate?secret=$CRON_SECRET&match=<id>"
```

## 已踩过的坑（别再踩）

- **PostgREST 一对一联表返回对象不是数组**：`matches → reports` 因 `unique(match_id)` 返回单对象，取数要兼容两种形态（见 `app/match/[id]/page.tsx`）。
- **AI 会幻觉东道主/世预赛**：报告 prompt 里已注入「美加墨联办、东道主自动晋级」背景事实，新增 AI 功能时同样要喂背景事实，并禁止其引用境外赔率。
- **禁用词单字误杀**：「稳」会命中「稳定」，靠 `SAFE_EXCEPTIONS` 白名单解决；往白名单加词必须是明确与投注无关的中性词。
- **时间一律北京时间展示**：用 `Intl.DateTimeFormat` + `timeZone: "Asia/Shanghai"`，数据库存 UTC（timestamptz）。
- **路由文件只能导出 HTTP 方法**：共享逻辑放 `lib/`，不要从 `route.ts` 导出工具函数。
- Next 16 动态路由 `params` 是 Promise：`const { id } = await params`。

## 协作约定

- 默认用中文回复用户、写界面文案；代码注释中文。
- UI 风格：「夜场数据台」暗色主题。设计令牌在 `globals.css` 的 `@theme`（bg-pitch/surface/raised、text-ink/mut/faint、text-neon 数据绿、text-amber 赔率琥珀、text-live 红），复用 `.card` `.chip` 类与 `anim-*` 动画；数字一律加 `font-num tabular-nums`（Barlow Condensed 记分牌体）。不要再引入 emerald/neutral 等裸 Tailwind 调色板。
- 新功能完成后：① `npm run build` 必须通过；② 对照规格第 0/11 章自检；③ 更新 `../项目进度.md`。
- 涉及爬虫/抓数的模糊地带（规格 4.3）：**停下来问用户，不要自行用绕过的方式解决**。
- 不要主动 git commit/push，除非用户要求。
