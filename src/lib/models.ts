/**
 * 大模型注册表（深度推演可选引擎）。
 * 差异化核心：不同大模型能力不同、消耗积分不同，越强越贵。
 *
 * 接入方式统一走 OpenAI 兼容格式（见 lib/ai.ts）：加一个模型只需
 * 填 baseUrlEnv / keyEnv / model 三个字段。未配置 key 的模型在前端显示为
 * 「敬请期待」，可展示但不可运行——honest，不拿便宜模型冒充贵模型。
 *
 * 合规：模型产出为「赛事分析与概率推演」，非预测胜负/荐号；积分纯虚拟不可提现。
 */

export type ModelTier = "entry" | "advanced" | "flagship";

export interface ModelSpec {
  id: string;
  name: string; // 展示名
  provider: string; // 厂商
  origin: "cn" | "intl"; // 国产 / 国外
  tier: ModelTier;
  cost: number; // 单次推演消耗积分
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
  // —— 旗舰·国外（最贵）——
  {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    origin: "intl",
    tier: "flagship",
    cost: 300,
    baseUrlEnv: "CLAUDE_BASE_URL",
    keyEnv: "CLAUDE_API_KEY",
    model: "claude-sonnet-4-6",
    blurb: "长链路推理，战术拆解最细腻",
  },
  {
    id: "gpt",
    name: "GPT",
    provider: "OpenAI",
    origin: "intl",
    tier: "flagship",
    cost: 300,
    baseUrlEnv: "OPENAI_BASE_URL",
    keyEnv: "OPENAI_API_KEY",
    model: "gpt-4.1",
    blurb: "综合理解力强，叙述老练",
  },
  // —— 旗舰·国产 ——
  {
    id: "deepseek-pro",
    name: "DeepSeek 深度",
    provider: "深度求索",
    origin: "cn",
    tier: "flagship",
    cost: 150,
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-v4-pro",
    blurb: "带思考链，深度推演主力",
  },
  {
    id: "qwen",
    name: "通义千问",
    provider: "阿里",
    origin: "cn",
    tier: "flagship",
    cost: 150,
    baseUrlEnv: "QWEN_BASE_URL",
    keyEnv: "QWEN_API_KEY",
    model: "qwen-max",
    blurb: "中文语感与数据结合好",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    provider: "智谱",
    origin: "cn",
    tier: "flagship",
    cost: 150,
    baseUrlEnv: "GLM_BASE_URL",
    keyEnv: "GLM_API_KEY",
    model: "glm-4.6",
    blurb: "逻辑严谨，结构清晰",
  },
  {
    id: "doubao",
    name: "豆包",
    provider: "字节",
    origin: "cn",
    tier: "flagship",
    cost: 150,
    baseUrlEnv: "DOUBAO_BASE_URL",
    keyEnv: "DOUBAO_API_KEY",
    model: "doubao-pro",
    blurb: "响应快，性价比高",
  },
  {
    id: "kimi",
    name: "Moonshot Kimi",
    provider: "月之暗面",
    origin: "cn",
    tier: "flagship",
    cost: 150,
    baseUrlEnv: "KIMI_BASE_URL",
    keyEnv: "KIMI_API_KEY",
    model: "moonshot-v1-32k",
    blurb: "长文本，资料整合强",
  },
  // —— 进阶 ——
  {
    id: "ernie",
    name: "文心一言",
    provider: "百度",
    origin: "cn",
    tier: "advanced",
    cost: 100,
    baseUrlEnv: "ERNIE_BASE_URL",
    keyEnv: "ERNIE_API_KEY",
    model: "ernie-4.5",
    blurb: "知识面广",
  },
  {
    id: "hunyuan",
    name: "腾讯混元",
    provider: "腾讯",
    origin: "cn",
    tier: "advanced",
    cost: 100,
    baseUrlEnv: "HUNYUAN_BASE_URL",
    keyEnv: "HUNYUAN_API_KEY",
    model: "hunyuan-pro",
    blurb: "稳健均衡",
  },
  {
    id: "minimax",
    name: "MiniMax",
    provider: "MiniMax",
    origin: "cn",
    tier: "advanced",
    cost: 100,
    baseUrlEnv: "MINIMAX_BASE_URL",
    keyEnv: "MINIMAX_API_KEY",
    model: "abab6.5",
    blurb: "表达流畅",
  },
  // —— 入门（最便宜）——
  {
    id: "deepseek-flash",
    name: "DeepSeek 极速",
    provider: "深度求索",
    origin: "cn",
    tier: "entry",
    cost: 50,
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-v4-flash",
    blurb: "秒出快报，尝鲜首选",
  },
  {
    id: "baichuan",
    name: "百川智能",
    provider: "百川",
    origin: "cn",
    tier: "entry",
    cost: 50,
    baseUrlEnv: "BAICHUAN_BASE_URL",
    keyEnv: "BAICHUAN_API_KEY",
    model: "Baichuan4",
    blurb: "轻量快速",
  },
  {
    id: "spark",
    name: "讯飞星火",
    provider: "讯飞",
    origin: "cn",
    tier: "entry",
    cost: 50,
    baseUrlEnv: "SPARK_BASE_URL",
    keyEnv: "SPARK_API_KEY",
    model: "spark-max",
    blurb: "中文基础扎实",
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** 该模型是否已配置密钥（服务端用，决定可不可运行） */
export function isModelAvailable(spec: ModelSpec): boolean {
  return !!process.env[spec.keyEnv];
}

/** 前端用的精简列表（含可用状态，不含 env/key 细节） */
export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  origin: "cn" | "intl";
  tier: ModelTier;
  cost: number;
  blurb: string;
  available: boolean;
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
      blurb: m.blurb,
      available: isModelAvailable(m),
    }));
}
