import "server-only";

import { supabaseAdmin } from "./supabase";
import { registerOrGet } from "./games";

export interface LinkResult {
  ok: boolean;
  /** 登录后该浏览器应使用的统一身份 id（写回 localStorage 的 device id） */
  accountId?: string;
  email?: string;
  /** 是否为这台设备首次绑定该账号（积分已随设备升级保留） */
  upgraded?: boolean;
  error?: string;
}

/**
 * 把当前设备访客身份与邮箱账号关联。
 *
 * - 该邮箱首次登录：把当前设备的访客 profile「升级」为账号（写 email + auth_user_id），
 *   完整保留这台设备的积分与记录。
 * - 该邮箱已有账号（之前在别的设备登录过）：直接返回账号 profile id，
 *   当前设备的空白访客身份作废——**不并入新设备的新手积分，防止清缓存反复刷新手积分**。
 */
export async function linkAccount(deviceId: string, accessToken: string): Promise<LinkResult> {
  const db = supabaseAdmin();

  // 用 access_token 验证身份，拿到 Auth 用户
  const { data: userData, error: userErr } = await db.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return { ok: false, error: "登录凭证无效或已过期" };
  }
  const authUserId = userData.user.id;
  const email = userData.user.email ?? null;

  // 该 Auth 用户是否已有账号 profile
  const { data: accountProfile } = await db
    .from("profiles")
    .select("id, email, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (accountProfile) {
    // 已有账号：当前浏览器接入该账号，丢弃当前设备的访客身份
    return { ok: true, accountId: accountProfile.id as string, email: email ?? undefined, upgraded: false };
  }

  // 首次登录：把当前设备访客 profile 升级为账号
  const deviceProfile = await registerOrGet(deviceId);

  // 防御：该邮箱可能曾绑过别的设备但 auth_user_id 漏写——按 email 兜底
  if (email) {
    const { data: byEmail } = await db
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .neq("id", deviceProfile.id)
      .maybeSingle();
    if (byEmail) {
      await db.from("profiles").update({ auth_user_id: authUserId }).eq("id", byEmail.id);
      return { ok: true, accountId: byEmail.id as string, email, upgraded: false };
    }
  }

  const { error: upErr } = await db
    .from("profiles")
    .update({ email, auth_user_id: authUserId })
    .eq("id", deviceProfile.id);
  if (upErr) {
    // 唯一约束冲突等
    return { ok: false, error: "绑定失败，请重试" };
  }

  return { ok: true, accountId: deviceProfile.id, email: email ?? undefined, upgraded: true };
}
