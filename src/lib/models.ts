/**
 * 大模型注册表（深度推演可选引擎）。
 * 差异化核心：不同大模型能力不同、消耗积分不同，越强越贵。
 *
 * 接入方式统一走 OpenAI 兼容格式（见 lib/ai.ts）。当前产品形态保留
 * 多模型展示与差异化积分，后端统一走已配置的默认生成通道，保证用户
 * 选择链路顺畅。
 *
 * 合规：模型产出为「赛事分析与概率推演」，非预测胜负/荐号；积分纯虚拟不可提现。
 */

export type ModelTier = "entry" | "advanced" | "flagship";

/** 按订阅档位可访问的模型范围 */
export type SubTier = "free" | "pro" | "max";

export interface ModelSpec {
  id: string;
  name: string; // 展示名
  provider: string; // 厂商
  origin: "cn" | "intl"; // 国产 / 国外
  tier: ModelTier;
  cost: number; // 单次推演消耗积分
  minSub: SubTier; // 最低订阅档位才能使用
  baseUrlEnv: string; // 接口地址环境变量名
  keyEnv: string; // 密钥环境变量名
  model: string; // 接口里的模型标识
  blurb: string; // 一句话卖点
}

/** 档位 → 默认积分（可被单模型 cost 覆盖） */
export const TIER_LABEL: Record<ModelTier, string> = {
  entry: "入门",
  advanced: "进阶",
  flagship: "旗舰",
};

export const MODELS: ModelSpec[] = [
  // —— 旗舰·国外（Max 专属）——
  {
    id: "claude-opus",
    name: "Claude Opus 4.8",
    provider: "Anthropic",
    origin: "intl",
    tier: "flagship",
    cost: 600,
    minSub: "max",
    baseUrlEnv: "CLAUDE_BASE_URL",
    keyEnv: "CLAUDE_API_KEY",
    model: "claude-opus-4-8",
    blurb: "最强推理，战术拆解最细腻",
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    origin: "intl",
    tier: "flagship",
    cost: 400,
    minSub: "max",
    baseUrlEnv: "CLAUDE_BASE_URL",
    keyEnv: "CLAUDE_API_KEY",
    model: "claude-sonnet-4-6",
    blurb: "速度与深度均衡，性价比高",
  },
  {
    id: "gpt55",
    name: "GPT-5.5",
    provider: "OpenAI",
    origin: "intl",
    tier: "flagship",
    cost: 600,
    minSub: "max",
    baseUrlEnv: "OPENAI_BASE_URL",
    keyEnv: "OPENAI_API_KEY",
    model: "gpt-5.5",
    blurb: "综合推理强，叙述逻辑扎实",
  },
  // —— 旗舰·国产（Pro 及以上）——
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "深度求索",
    origin: "cn",
    tier: "flagship",
    cost: 300,
    minSub: "pro",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-v4-pro",
    blurb: "最新旗舰，1.6T 参数深度推理",
  },
  {
    id: "qwen3",
    name: "Qwen3-235B",
    provider: "阿里",
    origin: "cn",
    tier: "flagship",
    cost: 300,
    minSub: "pro",
    baseUrlEnv: "QWEN_BASE_URL",
    keyEnv: "QWEN_API_KEY",
    model: "qwen3-235b-a22b",
    blurb: "中文理解强，多维数据整合细",
  },
  {
    id: "glm-z1",
    name: "GLM-Z1-Plus",
    provider: "智谱",
    origin: "cn",
    tier: "flagship",
    cost: 300,
    minSub: "pro",
    baseUrlEnv: "GLM_BASE_URL",
    keyEnv: "GLM_API_KEY",
    model: "glm-z1-plus",
    blurb: "推理模型，逻辑链清晰",
  },
  {
    id: "doubao",
    name: "豆包 Seed 2.0",
    provider: "字节",
    origin: "cn",
    tier: "flagship",
    cost: 300,
    minSub: "pro",
    baseUrlEnv: "DOUBAO_BASE_URL",
    keyEnv: "DOUBAO_API_KEY",
    model: "doubao-seed-2.0-pro",
    blurb: "响应快，中文表达流畅",
  },
  {
    id: "kimi",
    name: "Kimi K2.6",
    provider: "月之暗面",
    origin: "cn",
    tier: "flagship",
    cost: 300,
    minSub: "pro",
    baseUrlEnv: "KIMI_BASE_URL",
    keyEnv: "KIMI_API_KEY",
    model: "kimi-k2.6",
    blurb: "长文本旗舰，资料整合能力强",
  },
  // —— 进阶（Pro 及以上）——
  {
    id: "ernie",
    name: "文心 X1",
    provider: "百度",
    origin: "cn",
    tier: "advanced",
    cost: 150,
    minSub: "pro",
    baseUrlEnv: "ERNIE_BASE_URL",
    keyEnv: "ERNIE_API_KEY",
    model: "ernie-x1",
    blurb: "推理增强，分析条理清晰",
  },
  {
    id: "hunyuan",
    name: "混元 T1",
    provider: "腾讯",
    origin: "cn",
    tier: "advanced",
    cost: 150,
    minSub: "pro",
    baseUrlEnv: "HUNYUAN_BASE_URL",
    keyEnv: "HUNYUAN_API_KEY",
    model: "hunyuan-t1",
    blurb: "带思维链，推理能力升级",
  },
  {
    id: "minimax",
    name: "MiniMax M3",
    provider: "MiniMax",
    origin: "cn",
    tier: "advanced",
    cost: 150,
    minSub: "pro",
    baseUrlEnv: "MINIMAX_BASE_URL",
    keyEnv: "MINIMAX_API_KEY",
    model: "MiniMax-M3",
    blurb: "百万上下文，编程推理双强",
  },
  // —— 入门（免费可用）——
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "深度求索",
    origin: "cn",
    tier: "entry",
    cost: 80,
    minSub: "free",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    blurb: "秒出快报，尝鲜首选",
  },
  {
    id: "qwen3-fast",
    name: "Qwen3-30B",
    provider: "阿里",
    origin: "cn",
    tier: "entry",
    cost: 80,
    minSub: "free",
    baseUrlEnv: "QWEN_BASE_URL",
    keyEnv: "QWEN_API_KEY",
    model: "qwen3-30b-a3b",
    blurb: "轻量快速，适合快速概览",
  },
  {
    id: "spark",
    name: "星火 X1",
    provider: "讯飞",
    origin: "cn",
    tier: "entry",
    cost: 80,
    minSub: "free",
    baseUrlEnv: "SPARK_BASE_URL",
    keyEnv: "SPARK_API_KEY",
    model: "x1",
    blurb: "推理版，中文基础扎实",
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** 判断某档位订阅能否使用该模型 */
const SUB_ORDER: SubTier[] = ["free", "pro", "max"];
export function canUseModel(sub: SubTier, model: { minSub: SubTier }): boolean {
  return SUB_ORDER.indexOf(sub) >= SUB_ORDER.indexOf(model.minSub);
}

/** 前端用的精简列表（不含 env/key 细节） */
export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  origin: "cn" | "intl";
  tier: ModelTier;
  cost: number;
  minSub: SubTier;
  blurb: string;
}

export function listModelOptions(): ModelOption[] {
  const order: ModelTier[] = ["flagship", "advanced", "entry"];
  return [...MODELS]
    .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || b.cost - a.cost)
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      origin: m.origin,
      tier: m.tier,
      cost: m.cost,
      minSub: m.minSub,
      blurb: m.blurb,
    }));
}
