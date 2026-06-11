/**
 * AI 分析模式（合规口径：数据分析与赛前推演，不含投注建议/荐号）。
 * 命名与文案统一来源，首页、赛程、比赛详情复用。
 */
export const ANALYSIS_MODES = {
  deep: {
    key: "deep",
    name: "深度推演",
    en: "DEEP MODEL",
    icon: "🔬",
    tagline: "多模型概率推演引擎",
    desc: "赔率去水位 + 双变量泊松 + 评分差融合，量化每个比分与赛果的概率分布——理解比赛的不确定性，非预测胜负，不构成任何投注建议。订阅尊享。",
    free: false,
  },
} as const;

export type AnalysisModeKey = keyof typeof ANALYSIS_MODES;
