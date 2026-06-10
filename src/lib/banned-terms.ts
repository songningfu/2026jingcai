/**
 * 全局禁用词表与后置过滤（规格文档第 0 章第 1 条、第 6.4 节）
 *
 * 所有 AI 生成内容、运营录入内容在入库/展示前必须经过 filterContent()。
 * 命中禁用词的内容一律不得原样展示，回退到中性表达并记录日志。
 *
 * 注意：表中含单字词（如「稳」「押」），会命中「稳定」「押韵」等正常用语，
 * 这是有意为之的保守策略——宁可误杀重生成，不可漏放（第 0 章为最高优先级）。
 */

export const BANNED_TERMS: readonly string[] = [
  "推荐",
  "看好",
  "建议买",
  "稳",
  "必胜",
  "必中",
  "必红",
  "跟单",
  "上车",
  "押",
  "包中",
  "稳赢",
  "保本",
  "保赢",
  "躺赢",
  "梭哈",
  "重注",
  "下注建议",
  "市场倾向",
  "更可能",
  "概率较高",
  "大概率",
  "买它",
  "冲就完了",
  "内幕",
  "准确率保证",
];

/** 命中时的中性回退文案 */
export const NEUTRAL_FALLBACK =
  "本段内容已按平台规范调整：足球比赛结果存在高度不确定性，以上数据与分析仅供参考，不构成任何购彩建议。";

/**
 * 安全词白名单：包含禁用单字但语义与投注无关的常用词。
 * 扫描前先临时屏蔽这些词，避免「稳定」被「稳」误杀。
 * 注意：只允许收录明确中性的词，任何带投注暗示的组合不得加入。
 */
const SAFE_EXCEPTIONS: readonly string[] = [
  "稳定",
  "稳健",
  "平稳",
  "稳固",
  "沉稳",
  "站稳",
  "企稳",
  "押韵",
];

/** 把安全词替换为占位符后再做禁用词匹配 */
function maskSafe(text: string): string {
  let masked = text;
  for (const safe of SAFE_EXCEPTIONS) {
    masked = masked.replaceAll(safe, "□".repeat(safe.length));
  }
  return masked;
}

/** 返回文本中命中的所有禁用词（去重，已排除安全词） */
export function findBannedTerms(text: string): string[] {
  const masked = maskSafe(text);
  const hits = BANNED_TERMS.filter((term) => masked.includes(term));
  return [...new Set(hits)];
}

export function containsBannedTerms(text: string): boolean {
  const masked = maskSafe(text);
  return BANNED_TERMS.some((term) => masked.includes(term));
}

export interface FilterResult {
  /** 过滤后可安全展示的文本 */
  text: string;
  /** 是否发生了替换 */
  replaced: boolean;
  /** 命中的禁用词，调用方应记录日志 */
  hits: string[];
}

/**
 * 后置过滤：按句扫描，命中禁用词的句子整句替换为中性文案。
 * 全文命中过多（≥3 句）时整段替换，调用方应触发重新生成。
 */
export function filterContent(text: string): FilterResult {
  const hits = findBannedTerms(text);
  if (hits.length === 0) {
    return { text, replaced: false, hits: [] };
  }
  const sentences = text.split(/(?<=[。！？!?\n])/);
  let replacedCount = 0;
  const cleaned = sentences
    .map((s) => {
      if (containsBannedTerms(s)) {
        replacedCount++;
        return NEUTRAL_FALLBACK;
      }
      return s;
    })
    .join("");
  if (replacedCount >= 3) {
    return { text: NEUTRAL_FALLBACK, replaced: true, hits };
  }
  return { text: cleaned, replaced: true, hits };
}
