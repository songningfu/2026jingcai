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
  username: string | null;
  email: string | null;
  avatar_url: string | null;
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
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("id, nickname, username, email, avatar_url, points, sub_type, sub_expires")
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
    username: (profile?.username as string | null) ?? null,
    email: (profile?.email as string | null) ?? null,
    avatar_url: (profile?.avatar_url as string | null) ?? null,
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

/** 生成随机激活码（大写字母+数字，12位） */
export function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, (_, i) =>
    (i === 4 || i === 8 ? "-" : chars[Math.floor(Math.random() * chars.length)])
  ).join("");
}

/** 兑换激活码（从 activation_codes 表查询） */
export async function redeemCode(
  deviceId: string,
  code: string,
): Promise<{ ok: boolean; message: string; tier?: SubTier; subExpires?: string }> {
  const db = supabaseAdmin();
  const cleaned = code.trim().toUpperCase().replace(/\s/g, "");

  const { data: entry } = await db
    .from("activation_codes")
    .select("id, tier, days, is_active, used_at")
    .eq("code", cleaned)
    .maybeSingle();

  if (!entry) return { ok: false, message: "激活码无效" };
  if (!entry.is_active) return { ok: false, message: "激活码已作废" };
  if (entry.used_at) return { ok: false, message: "激活码已被使用" };

  const tier = entry.tier as "pro" | "max";
  const { subExpires } = await grantSubscription(deviceId, tier, entry.days);

  // 标记已使用
  await db.from("activation_codes")
    .update({ used_at: new Date().toISOString(), used_by: deviceId })
    .eq("id", entry.id);

  return {
    ok: true,
    message: `开通成功：${tier.toUpperCase()} ${entry.days} 天`,
    tier,
    subExpires,
  };
}
