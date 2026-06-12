import "server-only";
import type { ModelSpec } from "./models";

/** OpenAI 兼容的 JSON 补全。base/key/model 由调用方给定。 */
export async function chatJSONWith(opts: {
  base: string;
  key: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  label?: string;
}): Promise<string> {
  const res = await fetch(`${opts.base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: opts.maxTokens ?? 4000,
    }),
  });
  if (!res.ok) {
    throw new Error(`${opts.label ?? opts.model} 请求失败: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${opts.label ?? opts.model} 返回为空`);
  return content;
}

/** 按注册表里的模型规格调用。当前统一走默认生成通道，展示名用于链路标识。 */
export async function chatJSONWithModel(
  spec: ModelSpec,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  const base = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? spec.model;
  if (!key) throw new Error("当前推演通道暂不可用");
  return chatJSONWith({
    base,
    key,
    model,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens,
    label: spec.name,
  });
}

/**
 * 默认 DeepSeek 聊天补全（OpenAI 兼容格式），强制 JSON 输出。
 * 仅服务端调用。供未指定模型的旧路径使用。
 */
export async function chatJSON(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  const base = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
  if (!key) throw new Error("缺少 DEEPSEEK_API_KEY");
  return chatJSONWith({ base, key, model, system: opts.system, user: opts.user, maxTokens: opts.maxTokens, label: "DeepSeek" });
}
