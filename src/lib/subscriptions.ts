/**
 * 订阅档位（Free / Pro / Max）。
 * 合规：订阅卖的是「AI 分析工具的使用权益」（信息与效率），不是预测结果/荐号；
 * 正式收款待资质（规格 8.3），当前为手动开通。积分与订阅是两套：积分纯虚拟不可兑现。
 */
import type { ModelTier } from "./models";

export type SubTier = "free" | "pro" | "max";

export interface SubPlan {
  tier: SubTier;
  name: string;
  badge: string; // 角标
  priceLabel: string; // 展示价（资质就绪前为占位）
  highlight: boolean;
  checkinBonus: number; // 每日签到积分
  perks: string[]; // 权益清单（展示）
}

export const SUB_PLANS: Record<SubTier, SubPlan> = {
  free: {
    tier: "free",
    name: "免费",
    badge: "FREE",
    priceLabel: "¥0",
    highlight: false,
    checkinBonus: 100,
    perks: [
      "统计比分概率 · 免费无限",
      "深度推演按模型档位消耗积分",
      "积分竞猜 · 排行榜 · 价值指标",
      "每日签到 +100 积分",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    badge: "PRO",
    priceLabel: "敬请期待",
    highlight: true,
    checkinBonus: 200,
    perks: [
      "入门 / 进阶大模型推演 · 免积分无限",
      "旗舰大模型推演 · 积分 5 折",
      "每日签到 +200 积分",
      "Pro 专属蓝标徽章",
    ],
  },
  max: {
    tier: "max",
    name: "Max",
    badge: "MAX",
    priceLabel: "敬请期待",
    highlight: false,
    checkinBonus: 300,
    perks: [
      "全部大模型推演 · 免积分无限",
      "每日签到 +300 积分",
      "赔率异动提醒（即将上线）",
      "冠军金标徽章 · 尊享标识",
    ],
  },
};

/** 当前有效订阅档位（过期或无则 free） */
export function activeTier(subType?: string | null, subExpires?: string | null): SubTier {
  if (subType !== "pro" && subType !== "max") return "free";
  if (!subExpires) return "free";
  return new Date(subExpires).getTime() > Date.now() ? (subType as SubTier) : "free";
}

/** 按订阅档位 + 模型档位计算实际消耗积分 */
export function effectiveCost(tier: SubTier, modelTier: ModelTier, baseCost: number): number {
  if (tier === "max") return 0;
  if (tier === "pro") {
    return modelTier === "flagship" ? Math.ceil(baseCost / 2) : 0;
  }
  return baseCost;
}

/** 签到积分（按订阅档位加成） */
export function checkinBonus(tier: SubTier): number {
  return SUB_PLANS[tier].checkinBonus;
}
