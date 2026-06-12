import "server-only";

/**
 * 账户与订阅（设备身份）。
 * 合规：订阅卖「分析工具使用权益」，非预测结果；正式收款待资质（规格 8.3），
 * 当前用「开通码」手动开通。积分纯虚拟不可兑现，与订阅是两套体系。
 */
import { registerOrGet } from "./games";
import { activeTier, type SubTier } from "./subscriptions";
import { supabaseAdmin } from "./supabase";

export interface AccountView {
  id: string;
  nickname: string | null;
  points: number;
  tier: SubTier;
  subType: string | null;
  subExpires: string | null;
  unlocks: { match_id: number; model_id: string | null; created_at: string }[];
  predictions: {
    match_id: number;
    pick: string;
    points_staked: number;
    settled: boolean;
    won: boolean | null;
    points_delta: number | null;
  }[];
}

/** 读取账户全貌：资料 + 订阅 + 解锁/竞猜历史 */
export async function getAccount(deviceId: string): Promise<AccountView> {
  await registerOrGet(deviceId); // 确保已建档
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("id, nickname, points, sub_type, sub_expires")
    .eq("id", deviceId)
    .single();

  const [unlocksRes, predsRes] = await Promise.all([
    db
      .from("unlocks")
      .select("match_id, model_id, created_at")
      .eq("user_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("predictions")
      .select("match_id, pick, points_staked, settled, won, points_delta")
      .eq("user_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const subType = (profile?.sub_type as string | null) ?? null;
  const subExpires = (profile?.sub_expires as string | null) ?? null;

  return {
    id: deviceId,
    nickname: (profile?.nickname as string | null) ?? null,
    points: (profile?.points as number) ?? 0,
    tier: activeTier(subType, subExpires),
    subType,
    subExpires,
    unlocks: unlocksRes.data ?? [],
    predictions: predsRes.data ?? [],
  };
}

/** 直接授予订阅（被开通码兑换与运维手动开通共用） */
export async function grantSubscription(
  deviceId: string,
  tier: "pro" | "max",
  days: number,
): Promise<{ ok: boolean; subExpires: string }> {
  const db = supabaseAdmin();
  await registerOrGet(deviceId);
  // 在现有有效期基础上叠加（续费不缩水）
  const { data: cur } = await db
    .from("profiles")
    .select("sub_type, sub_expires")
    .eq("id", deviceId)
    .single();
  const now = Date.now();
  const base =
    cur?.sub_expires && new Date(cur.sub_expires).getTime() > now
      ? new Date(cur.sub_expires).getTime()
      : now;
  const expires = new Date(base + days * 86400_000).toISOString();
  await db
    .from("profiles")
    .update({ sub_type: tier, sub_expires: expires, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  return { ok: true, subExpires: expires };
}

/**
 * 兑换开通码。码表来自环境变量 REDEEM_CODES，格式：
 *   "CODE1:pro:30,CODE2:max:60"（码:档位:天数，逗号分隔）
 */
export async function redeemCode(
  deviceId: string,
  code: string,
): Promise<{ ok: boolean; message: string; tier?: SubTier; subExpires?: string }> {
  const raw = process.env.REDEEM_CODES ?? "";
  const map = new Map<string, { tier: "pro" | "max"; days: number }>();
  for (const part of raw.split(",")) {
    const [c, tier, days] = part.split(":");
    if (c && (tier === "pro" || tier === "max") && Number(days) > 0) {
      map.set(c.trim().toUpperCase(), { tier, days: Number(days) });
    }
  }
  const entry = map.get(code.trim().toUpperCase());
  if (!entry) return { ok: false, message: "开通码无效或已停用" };

  const { subExpires } = await grantSubscription(deviceId, entry.tier, entry.days);
  return {
    ok: true,
    message: `开通成功：${entry.tier.toUpperCase()} ${entry.days} 天`,
    tier: entry.tier,
    subExpires,
  };
}
