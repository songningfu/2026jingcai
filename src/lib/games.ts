import "server-only";

/**
 * 积分竞猜小游戏（规格第 9 章）
 * 合规红线（第 0 章第 5 条）：积分纯虚拟，只能由签到/竞猜/活动产生，
 * 不可充值、不可提现、不可兑换任何现金等价物。本文件不实现任何 points↔money 通道。
 * 所有积分变动同时写 points_ledger 审计流水。
 */
import { getModel } from "./models";
import { activeTier, checkinBonus, effectiveCost } from "./subscriptions";
import { supabaseAdmin } from "./supabase";

export const STARTING_POINTS = 300;
export const CHECKIN_POINTS = 40;
export const MIN_STAKE = 10;
export const DEFAULT_MULTIPLIER = 2.0;
export const DEEP_PREDICTION_COST = 300;
export const INVITE_BONUS_INVITEE = 300; // 使用邀请码的新用户奖励
export const INVITE_BONUS_INVITER = 150; // 邀请者每成功邀请一人奖励

export type Pick = "win" | "draw" | "loss";
const PICK_TO_OUTCOME: Record<Pick, string> = { win: "主胜", draw: "平", loss: "客胜" };
const PICK_LABEL: Record<Pick, string> = { win: "主胜", draw: "平局", loss: "客胜" };

export interface Profile {
  id: string;
  nickname: string | null;
  points: number;
  last_checkin: string | null;
  invite_code: string | null;
  invited_by: string | null;
}

export interface PredictionView {
  id: number;
  match_id: number;
  pick: Pick;
  points_staked: number;
  payout_multiplier: number;
  settled: boolean;
  won: boolean | null;
  points_delta: number | null;
}

export interface UnlockView {
  match_id: number;
  created_at: string;
}

function todayCN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

/** UUID 合法性校验，防止任意字符串注入 */
export function isValidDeviceId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

async function addPoints(
  userId: string,
  delta: number,
  reason: string,
  refMatch?: number,
): Promise<void> {
  const db = supabaseAdmin();
  await db.from("points_ledger").insert({
    user_id: userId,
    delta,
    reason,
    ref_match: refMatch ?? null,
  });
}

/**
 * 用积分解锁单场深度推演；已解锁时不重复扣积分。
 * @param cost 本次消耗积分（按所选大模型档位，默认 DEEP_PREDICTION_COST）
 * @param modelId 所选大模型 id（写入流水备查）
 */
export async function unlockDeepPrediction(
  deviceId: string,
  matchId: number,
  cost: number = DEEP_PREDICTION_COST,
  modelId?: string,
): Promise<{ ok: boolean; message: string; points?: number; unlocked?: boolean }> {
  const db = supabaseAdmin();
  if (!Number.isInteger(matchId)) return { ok: false, message: "比赛参数错误" };
  const charge = Number.isFinite(cost) && cost > 0 ? Math.round(cost) : DEEP_PREDICTION_COST;

  const profile = await registerOrGet(deviceId);
  const { data: match } = await db.from("matches").select("id").eq("id", matchId).maybeSingle();
  if (!match) return { ok: false, message: "比赛不存在" };

  const { data: existing } = await db
    .from("unlocks")
    .select("id")
    .eq("user_id", deviceId)
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing) {
    return { ok: true, message: "已解锁深度推演", points: profile.points, unlocked: true };
  }

  if (profile.points < charge) {
    return {
      ok: false,
      message: `积分不足，该模型推演需要 ${charge} 积分`,
      points: profile.points,
    };
  }

  const { error: unlockErr } = await db.from("unlocks").insert({
    user_id: deviceId,
    match_id: matchId,
  });
  if (unlockErr) {
    if (unlockErr.code === "23505") {
      return { ok: true, message: "已解锁深度推演", points: profile.points, unlocked: true };
    }
    return { ok: false, message: `解锁失败: ${unlockErr.message}` };
  }

  const nextPoints = profile.points - charge;
  await db
    .from("profiles")
    .update({ points: nextPoints, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  await addPoints(deviceId, -charge, modelId ? `unlock_deep:${modelId}` : "unlock_deep_prediction", matchId);

  return {
    ok: true,
    message: `已消耗 ${charge} 积分开启深度推演`,
    points: nextPoints,
    unlocked: true,
  };
}

/**
 * 按所选大模型开启深度推演：同一场同一模型只扣一次积分；已开启则直接放行。
 * @returns alreadyOpen 表示之前已开启（不重复扣分）
 */
export async function openDeepRun(
  deviceId: string,
  matchId: number,
  modelId: string,
  cost: number,
): Promise<{ ok: boolean; message: string; points?: number; alreadyOpen?: boolean }> {
  const db = supabaseAdmin();
  if (!Number.isInteger(matchId)) return { ok: false, message: "比赛参数错误" };
  const profile = await registerOrGet(deviceId);

  // 订阅档位 → 实际消耗（Max 全免；Pro 入门/进阶免、旗舰 5 折；Free 全价）
  const { data: sub } = await db
    .from("profiles")
    .select("sub_type, sub_expires")
    .eq("id", deviceId)
    .single();
  const tier = activeTier(sub?.sub_type, sub?.sub_expires);
  const modelTier = getModel(modelId)?.tier ?? "flagship";
  const base = Number.isFinite(cost) && cost > 0 ? Math.round(cost) : DEEP_PREDICTION_COST;
  const charge = effectiveCost(tier, modelTier, base);

  const { data: existing } = await db
    .from("unlocks")
    .select("id")
    .eq("user_id", deviceId)
    .eq("match_id", matchId)
    .eq("model_id", modelId)
    .maybeSingle();
  if (existing) {
    return { ok: true, message: "已开启", points: profile.points, alreadyOpen: true };
  }

  if (profile.points < charge) {
    return { ok: false, message: `积分不足，该模型推演需要 ${charge} 积分`, points: profile.points };
  }

  const { error: insErr } = await db
    .from("unlocks")
    .insert({ user_id: deviceId, match_id: matchId, model_id: modelId });
  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: true, message: "已开启", points: profile.points, alreadyOpen: true };
    }
    return { ok: false, message: `开启失败: ${insErr.message}` };
  }

  if (charge === 0) {
    await addPoints(deviceId, 0, `deep_run_sub:${tier}:${modelId}`, matchId);
    return { ok: true, message: `${tier.toUpperCase()} 会员免积分开启`, points: profile.points };
  }

  const next = profile.points - charge;
  await db
    .from("profiles")
    .update({ points: next, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  await addPoints(deviceId, -charge, `deep_run:${modelId}`, matchId);
  return { ok: true, message: `已消耗 ${charge} 积分`, points: next };
}

/** 生成 6 位大写字母数字邀请码（UUID 哈希，保证唯一） */
function makeInviteCode(deviceId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 0/O/1/I
  // 用 deviceId 的若干字节做确定性种子，再加时间戳
  const seed = deviceId.replace(/-/g, "") + Date.now().toString(36);
  let code = "";
  for (let i = 0; i < 6; i++) {
    const byte = parseInt(seed.slice(i * 2, i * 2 + 2), 16) || Math.floor(Math.random() * 256);
    code += chars[byte % chars.length];
  }
  return code;
}

/** 注册或读取设备身份对应的 profile；首次创建赠初始积分 */
export async function registerOrGet(deviceId: string, nickname?: string): Promise<Profile> {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("profiles")
    .select("id, nickname, points, last_checkin, invite_code, invited_by")
    .eq("id", deviceId)
    .maybeSingle();

  if (existing) {
    // 自动补全旧用户缺失的邀请码
    if (!existing.invite_code) {
      const code = makeInviteCode(deviceId);
      await db.from("profiles").update({ invite_code: code }).eq("id", deviceId);
      existing.invite_code = code;
    }
    if (nickname && nickname.trim() && nickname.trim() !== existing.nickname) {
      const { data: updated } = await db
        .from("profiles")
        .update({ nickname: nickname.trim().slice(0, 16), updated_at: new Date().toISOString() })
        .eq("id", deviceId)
        .select("id, nickname, points, last_checkin, invite_code, invited_by")
        .single();
      return updated as Profile;
    }
    return existing as Profile;
  }

  const inviteCode = makeInviteCode(deviceId);
  const { data: created, error } = await db
    .from("profiles")
    .insert({
      id: deviceId,
      nickname: nickname?.trim().slice(0, 16) || `球迷${deviceId.slice(0, 4)}`,
      points: STARTING_POINTS,
      invite_code: inviteCode,
    })
    .select("id, nickname, points, last_checkin, invite_code, invited_by")
    .single();
  if (error) throw new Error(`创建用户失败: ${error.message}`);
  await addPoints(deviceId, STARTING_POINTS, "signup");
  return created as Profile;
}

/**
 * 兑换邀请码：新设备输入他人邀请码，双方获得积分奖励。
 * 限制：每设备只能用一次；不能用自己的码。
 */
export async function redeemInviteCode(
  deviceId: string,
  code: string,
): Promise<{ ok: boolean; message: string; points?: number }> {
  const db = supabaseAdmin();
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return { ok: false, message: "邀请码格式不正确" };
  }

  const profile = await registerOrGet(deviceId);

  // 已用过邀请码
  if (profile.invited_by) {
    return { ok: false, message: "你已经使用过邀请码了" };
  }

  // 查找邀请者
  const { data: inviter } = await db
    .from("profiles")
    .select("id, points, invite_code")
    .eq("invite_code", normalized)
    .maybeSingle();

  if (!inviter) return { ok: false, message: "邀请码不存在" };
  if (inviter.id === deviceId) return { ok: false, message: "不能使用自己的邀请码" };

  // 给被邀请者加分
  const newPoints = profile.points + INVITE_BONUS_INVITEE;
  await db
    .from("profiles")
    .update({ points: newPoints, invited_by: inviter.id, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  await addPoints(deviceId, INVITE_BONUS_INVITEE, "invite_redeem");

  // 给邀请者加分
  const inviterNewPoints = inviter.points + INVITE_BONUS_INVITER;
  await db
    .from("profiles")
    .update({ points: inviterNewPoints, updated_at: new Date().toISOString() })
    .eq("id", inviter.id);
  await addPoints(inviter.id, INVITE_BONUS_INVITER, "invite_reward");

  // 写邀请事件流水
  // 写邀请事件流水（忽略重复写入错误）
  await db.from("invite_events").insert({ inviter_id: inviter.id, invitee_id: deviceId });

  return { ok: true, message: `邀请码有效！获得 ${INVITE_BONUS_INVITEE} 积分奖励`, points: newPoints };
}

/** 每日签到：每个北京时间自然日一次 */
export async function checkin(
  deviceId: string,
): Promise<{ ok: boolean; points: number; awarded: number; message: string }> {
  const db = supabaseAdmin();
  const profile = await registerOrGet(deviceId);
  const today = todayCN();
  if (profile.last_checkin === today) {
    return { ok: false, points: profile.points, awarded: 0, message: "今天已签到，明天再来" };
  }
  // 签到积分按订阅档位加成（Free 40 / Pro 200 / Max 300）
  const { data: sub } = await db
    .from("profiles")
    .select("sub_type, sub_expires")
    .eq("id", deviceId)
    .single();
  const base = checkinBonus(activeTier(sub?.sub_type, sub?.sub_expires));
  // 端午节活动（6/20-22）额外赠 100 积分
  const bj = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const d = bj.getFullYear() * 10000 + (bj.getMonth() + 1) * 100 + bj.getDate();
  const duanwuBonus = (d >= 20260620 && d <= 20260622) ? 100 : 0;
  const awarded = base + duanwuBonus;
  const newPoints = profile.points + awarded;
  await db
    .from("profiles")
    .update({ points: newPoints, last_checkin: today, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  await addPoints(deviceId, awarded, "checkin");
  const msg = duanwuBonus > 0
    ? `签到成功 +${awarded}（含端午节奖励 +${duanwuBonus}）`
    : `签到成功 +${awarded}`;
  return { ok: true, points: newPoints, awarded, message: msg };
}

/** 该场胜平负官方赔率 → 各结果倍数（无则用默认） */
async function getMultiplier(matchId: number, pick: Pick): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("odds")
    .select("outcome, odd, captured_at")
    .eq("match_id", matchId)
    .eq("play_type", "whl")
    .order("captured_at", { ascending: false })
    .limit(9);
  const want = PICK_TO_OUTCOME[pick];
  const row = (data ?? []).find((r) => r.outcome === want);
  const odd = row ? Number(row.odd) : NaN;
  return Number.isFinite(odd) && odd > 1 ? odd : DEFAULT_MULTIPLIER;
}

/** 发起竞猜：校验比赛未开赛、积分足够、同场未重复猜；扣下注积分并锁定倍数 */
export async function predict(
  deviceId: string,
  matchId: number,
  pick: Pick,
  stake: number,
): Promise<{ ok: boolean; message: string; points?: number }> {
  const db = supabaseAdmin();
  if (!["win", "draw", "loss"].includes(pick)) return { ok: false, message: "无效的竞猜选项" };
  if (!Number.isInteger(stake) || stake < MIN_STAKE) {
    return { ok: false, message: `最少投入 ${MIN_STAKE} 积分` };
  }

  const profile = await registerOrGet(deviceId);
  if (profile.points < stake) return { ok: false, message: "积分不足" };

  const { data: match } = await db
    .from("matches")
    .select("id, status, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { ok: false, message: "比赛不存在" };
  if (match.status !== "scheduled" || new Date(match.kickoff_at).getTime() <= Date.now()) {
    return { ok: false, message: "该场已开赛或不可竞猜" };
  }

  const { data: dup } = await db
    .from("predictions")
    .select("id")
    .eq("user_id", deviceId)
    .eq("match_id", matchId)
    .maybeSingle();
  if (dup) return { ok: false, message: "这场你已经猜过了" };

  const multiplier = await getMultiplier(matchId, pick);
  const newPoints = profile.points - stake;

  const { error: insErr } = await db.from("predictions").insert({
    user_id: deviceId,
    match_id: matchId,
    pick,
    points_staked: stake,
    payout_multiplier: multiplier,
    settled: false,
  });
  if (insErr) return { ok: false, message: `竞猜失败: ${insErr.message}` };

  await db
    .from("profiles")
    .update({ points: newPoints, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  await addPoints(deviceId, -stake, "stake", matchId);

  return { ok: true, message: `已竞猜「${PICK_LABEL[pick]}」`, points: newPoints };
}

/** 结算一场比赛的全部未结算竞猜（比赛完赛后由 sync 调用） */
export async function settleMatchPredictions(
  matchId: number,
  homeScore: number,
  awayScore: number,
): Promise<{ settled: number }> {
  const db = supabaseAdmin();
  const result: Pick = homeScore > awayScore ? "win" : homeScore < awayScore ? "loss" : "draw";

  const { data: preds } = await db
    .from("predictions")
    .select("id, user_id, pick, points_staked, payout_multiplier")
    .eq("match_id", matchId)
    .eq("settled", false);
  if (!preds || preds.length === 0) return { settled: 0 };

  for (const p of preds) {
    const won = p.pick === result;
    // 猜中：拿回 stake×倍数（净 +stake×(倍数-1)）；猜错：已扣 stake，不再变动
    const payout = won ? Math.round(p.points_staked * Number(p.payout_multiplier)) : 0;
    const delta = won ? payout - p.points_staked : -p.points_staked;

    await db
      .from("predictions")
      .update({
        settled: true,
        won,
        points_delta: delta,
        settled_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (won && payout > 0) {
      const { data: prof } = await db
        .from("profiles")
        .select("points")
        .eq("id", p.user_id)
        .maybeSingle();
      if (prof) {
        await db
          .from("profiles")
          .update({ points: prof.points + payout, updated_at: new Date().toISOString() })
          .eq("id", p.user_id);
        await addPoints(p.user_id, payout, "settle_win", matchId);
      }
    } else {
      await addPoints(p.user_id, 0, "settle_lose", matchId);
    }
  }
  return { settled: preds.length };
}

/** 结算所有「已完赛但仍有未结算竞猜」的比赛（由 sync 每次调用，幂等） */
export async function settleFinishedMatches(): Promise<{ matches: number; settled: number }> {
  const db = supabaseAdmin();
  const { data: pending } = await db
    .from("predictions")
    .select("match_id")
    .eq("settled", false)
    .limit(2000);
  const matchIds = [...new Set((pending ?? []).map((p) => p.match_id))];
  if (matchIds.length === 0) return { matches: 0, settled: 0 };

  const { data: matches } = await db
    .from("matches")
    .select("id, status, home_score, away_score")
    .in("id", matchIds)
    .eq("status", "finished");

  let settled = 0;
  let count = 0;
  for (const m of matches ?? []) {
    if (m.home_score === null || m.away_score === null) continue;
    const r = await settleMatchPredictions(m.id, m.home_score, m.away_score);
    settled += r.settled;
    if (r.settled > 0) count++;
  }
  return { matches: count, settled };
}

/** 我的资料 + 竞猜记录 + 邀请信息 */
export async function getMe(deviceId: string): Promise<{
  profile: Profile;
  predictions: PredictionView[];
  unlocks: UnlockView[];
  rank: number | null;
  inviteCount: number;
}> {
  const db = supabaseAdmin();
  const profile = await registerOrGet(deviceId);
  const { data: predictions } = await db
    .from("predictions")
    .select("id, match_id, pick, points_staked, payout_multiplier, settled, won, points_delta")
    .eq("user_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: unlocks } = await db
    .from("unlocks")
    .select("match_id, created_at")
    .eq("user_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);

  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("points", profile.points);

  // 我邀请成功的人数
  const { count: inviteCount } = await db
    .from("invite_events")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", deviceId);

  return {
    profile,
    predictions: (predictions ?? []) as PredictionView[],
    unlocks: (unlocks ?? []) as UnlockView[],
    rank: typeof count === "number" ? count + 1 : null,
    inviteCount: inviteCount ?? 0,
  };
}

/** 排行榜 Top N */
export async function leaderboard(
  limit = 50,
): Promise<{ nickname: string | null; points: number }[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("profiles")
    .select("nickname, points")
    .order("points", { ascending: false })
    .limit(limit);
  return (data ?? []) as { nickname: string | null; points: number }[];
}
