/**
 * 两种 AI 分析模式（合规口径：分析/解读/洞察，不含「预测/荐号」）。
 * 命名与文案统一来源，首页、赛程、比赛详情复用。
 */
export const ANALYSIS_MODES = {
  flash: {
    key: "flash",
    name: "极速洞察",
    en: "FLASH INSIGHT",
    icon: "⚡",
    tagline: "顶尖模型秒级生成的赛事数据解读",
    desc: "由全球顶尖大模型驱动，几十秒输出双方阵容、近况与战术看点，从概率学角度解读官方赔率背后的市场逻辑。免费。",
    free: true,
  },
  deep: {
    key: "deep",
    name: "深度洞察",
    en: "DEEP INSIGHT",
    icon: "🔬",
    tagline: "教练视角的全维度战术拆解",
    desc: "更强模型 + 更长推理，拆解战术热区、定位球攻防对位、关键球员影响与多维数据交叉分析。订阅尊享。",
    free: false,
  },
} as const;

export type AnalysisModeKey = keyof typeof ANALYSIS_MODES;
