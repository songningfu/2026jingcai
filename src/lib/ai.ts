import "server-only";

/**
 * DeepSeek 聊天补全（OpenAI 兼容格式），强制 JSON 输出。
 * 仅服务端调用。
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

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: opts.maxTokens ?? 4000,
    }),
  });
  if (!res.ok) {
    throw new Error(`DeepSeek 请求失败: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回为空");
  return content;
}
