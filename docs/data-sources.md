# 数据源接入策略

本项目的核心数据原则：官方公开数据优先，第三方数据只做补充，AI 只做解释与整理，不虚构事实。

## 已接入

### 中国竞彩网公开足球计算器

- 用途：竞彩官方胜平负、让球胜平负赔率；概率工具的官方赔率模式。
- 入口：`webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry`
- 页面来源：https://www.sporttery.cn/jc/jsq/zqhhgg/
- 当前代码：`src/lib/sporttery.ts`、`src/app/calculator/*`
- 落库同步：`src/lib/sporttery-sync.ts`、`/api/odds/sync?secret=...`，写入 `odds` 表后供 AI 报告读取。
- 验证结果：官方接口返回 26 场，已匹配并同步 24 场世界杯比赛；2 场国际赛未写入，避免污染世界杯数据。
- 注意：只展示官方公开赔率并做数学换算，不提供下单、出票、代购、推荐或方案结论。

## 强烈推荐

### emrbli/worldcup

- 仓库：https://github.com/emrbli/worldcup
- 许可证：MIT；数据源归因见其 `ATTRIBUTION.md` 与 `DISCLAIMER.md`。
- 对本项目价值：补 `squads` 表。该项目 bundled dump 包含 48 队、约 1248 名球员、号码、位置、俱乐部、生日、国籍，以及多语言队名。
- 当前落地：
  - `supabase/migrations/20260611_squads_enrichment.sql`
  - `scripts/import-worldcup-squads.mjs`
- 使用方式：

```bash
# 先在 Supabase SQL Editor 执行 supabase/migrations/20260611_squads_enrichment.sql

# 只验证，不写库
npm run import:squads:dry

# 确认样例和数量后再写入
npm run import:squads -- --write
```

导入逻辑：从 `db/dump/worldcup.sql.gz` 解析 `teams` 与 `players`，使用 `teams.source_ids.football_data` 映射到本项目 `teams.id`，写入 `squads`，来源标记为 `emrbli/worldcup`。

## 免费备胎

### openfootball/worldcup.json

- 仓库：https://github.com/openfootball/worldcup.json
- 用途：football-data.org 限流或异常时，作为赛程、球队、球场、城市信息的降级数据源。
- 优先级：低于 football-data.org；先不替换现有 `syncMatches()`。
- 建议接入点：未来给 `src/lib/sync.ts` 加 fallback 分支，只有 football-data 请求失败或超限时使用。

## 模型测算候选

### martineastwood/penaltyblog

- 仓库：https://github.com/martineastwood/penaltyblog
- 用途：未来规格 5.4 的模型测算、Poisson / Dixon-Coles、去水位隐含概率、凯利指标。
- 接入时机：等赔率历史、赛果样本和球队基础数据稳定后再做。
- 产品边界：模型结果只能标注为“模型估算”，不得输出投注建议、命中率承诺或收益承诺。

## 仅作参考

国内竞彩爬虫类项目可以用于确认字段含义，但不直接复用业务逻辑或文案。原因：

- 多数年久失修，稳定性未知。
- 常见“预测、推荐、命中率”功能和宣传语，触碰本项目第 0 章红线。
- 本项目已经接入中国竞彩网官方公开端点，国内爬虫仓库的优先级降低。

## 当前优先级

1. 上线后把 `/api/sync`、`/api/odds/sync`、`/api/reports/generate` 挂到 Cron，让赛程、赔率和报告自动更新。
2. openfootball 作为赛程降级源，等 football-data 限流或异常时接。
3. penaltyblog 等高级工具阶段再引入，不提前增加系统复杂度。
