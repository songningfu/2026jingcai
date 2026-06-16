import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 60;

// 返回北京时间的日期字符串 "YYYY-MM-DD"
function bjDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const now = new Date();

    // 北京时间今天/昨天/前天
    const todayBJ = bjDate(now);
    const yesterdayBJ = bjDate(new Date(now.getTime() - 86400_000));
    const dayBeforeBJ = bjDate(new Date(now.getTime() - 2 * 86400_000));

    const past3days = new Date(now.getTime() - 3 * 86400_000);
    const next24h = new Date(now.getTime() + 24 * 3600_000);

    // 拉取最近3天 + 未来24h 的比赛
    const { data: matches } = await db
      .from("matches")
      .select(
        `id, kickoff_at, status, home_score, away_score, group_name,
         home:teams!matches_home_team_id_fkey(name_zh),
         away:teams!matches_away_team_id_fkey(name_zh)`,
      )
      .gte("kickoff_at", past3days.toISOString())
      .lte("kickoff_at", next24h.toISOString())
      .order("kickoff_at");

    const matchIds = (matches ?? []).map((m) => m.id);

    // 真实支持率投票
    const votesMap: Record<number, { win: number; loss: number }> = {};
    if (matchIds.length > 0) {
      const { data: voteRows } = await db
        .from("support_votes")
        .select("match_id, pick")
        .in("match_id", matchIds);
      for (const v of voteRows ?? []) {
        if (!votesMap[v.match_id]) votesMap[v.match_id] = { win: 0, loss: 0 };
        if (v.pick === "win") votesMap[v.match_id].win++;
        if (v.pick === "loss") votesMap[v.match_id].loss++;
      }
    }

    // 赔率（仅作备用种子，投票数不足时用）
    const oddsMap: Record<number, { win: number; draw: number; loss: number }> = {};
    if (matchIds.length > 0) {
      const { data: oddRows } = await db
        .from("odds")
        .select("match_id, outcome, odd")
        .in("match_id", matchIds)
        .eq("play_type", "HAD");
      for (const o of oddRows ?? []) {
        if (!oddsMap[o.match_id]) oddsMap[o.match_id] = { win: 0, draw: 0, loss: 0 };
        const inv = o.odd > 0 ? 1 / o.odd : 0;
        if (o.outcome === "H") oddsMap[o.match_id].win = inv;
        if (o.outcome === "D") oddsMap[o.match_id].draw = inv;
        if (o.outcome === "A") oddsMap[o.match_id].loss = inv;
      }
    }

    // 弹幕
    const { data: danmaku } = await db
      .from("predictions")
      .select("pick, profiles!predictions_user_id_fkey(nickname)")
      .not("pick", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);

    const PICK_LABEL: Record<string, string> = { win: "主胜", draw: "平局", loss: "客胜" };
    const TEMPLATES = [
      "这场我全押{pick}！",
      "{pick}稳了吧",
      "感觉{pick}",
      "分析完了，{pick}",
      "赔率看着{pick}合理",
      "{pick}，冲！",
      "数据支持{pick}",
    ];
    const preset = [
      "世界杯太好看了！", "这届进攻端太强了", "防守反击还是有效",
      "大家都在看哪场？", "赔率变化好快", "数据挺有意思的",
      "这场关键！", "球员状态是关键", "最爱看世界杯",
      "今晚熬夜看！", "主场优势明显", "这个分析有道理",
      "支持度挺均衡", "有意思，关注一下", "看赔率感觉很胶着",
    ];
    const realDanmaku = (danmaku ?? [])
      .filter((d) => d.profiles)
      .slice(0, 30)
      .map((d) => {
        const nick = (d.profiles as unknown as { nickname: string | null } | null)?.nickname ?? "球迷";
        const pick = PICK_LABEL[d.pick] ?? d.pick;
        const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
        return `${nick}：${tpl.replace("{pick}", pick)}`;
      });
    const allDanmaku = [...realDanmaku, ...preset].sort(() => Math.random() - 0.5).slice(0, 30);

    // 拉取已完赛比赛的 AI 报告预测结果
    const reportMap: Record<number, { result: string; score: string; total_goals: string }> = {};
    if (matchIds.length > 0) {
      const { data: reports } = await db
        .from("reports")
        .select("match_id, preview_json")
        .in("match_id", matchIds)
        .not("preview_json", "is", null);
      for (const r of reports ?? []) {
        const pred = (r.preview_json as Record<string, unknown>)?.prediction as
          | { result?: string; score?: string; total_goals?: string } | undefined;
        if (pred?.result) {
          reportMap[r.match_id] = {
            result: pred.result,
            score: pred.score ?? "",
            total_goals: pred.total_goals ?? "",
          };
        }
      }
    }

    // 实际总进球 → 体彩 TTG 档位标签
    function totalGoalsLabel(homeScore: number, awayScore: number): string {
      const n = Math.min(7, homeScore + awayScore);
      return n >= 7 ? "7+球" : `${n}球`;
    }

    // 根据比分判断实际胜负方向
    function actualResult(homeScore: number | null, awayScore: number | null): string | null {
      if (homeScore === null || awayScore === null) return null;
      if (homeScore > awayScore) return "主队胜";
      if (homeScore < awayScore) return "客队胜";
      return "平局";
    }

    const feed = (matches ?? []).map((m) => {
      const finished = m.status === "finished" || m.status === "FINISHED";
      const matchDayBJ = bjDate(new Date(m.kickoff_at));

      // 优先用真实投票；票数不足 10 票时用赔率种子作为底数
      const realVotes = votesMap[m.id];
      const odds = oddsMap[m.id];
      let winVotes = realVotes?.win ?? 0;
      let lossVotes = realVotes?.loss ?? 0;
      if (winVotes + lossVotes < 10) {
        // 票数不足时用 50/50 作为底数，避免一边倒
        winVotes += 25;
        lossVotes += 25;
      }
      const seed = { win: winVotes, draw: 0, loss: lossVotes };

      // 分组：今日 = 北京时间今天未完赛；预测 = 北京时间今天或昨天已完赛（凌晨赛+前一天）；更早 = 前天
      let day: "today" | "prediction" | "yesterday";
      if (!finished) {
        day = "today";
      } else if (matchDayBJ === todayBJ) {
        day = "prediction"; // 今天北京日历内已完赛（凌晨/上午场）→「我们的预测」
      } else if (matchDayBJ === yesterdayBJ) {
        day = "yesterday"; // 昨天已完赛 → 「更多赛果」
      } else {
        day = "yesterday"; // 前天及更早
      }

      // 计算模型命中情况（仅对已完赛比赛）
      // 命中优先级：比分 > 胜负 > 总进球数；都没中才记 miss
      let modelHit: "score" | "result" | "totalgoals" | "miss" | null = null;
      if (finished && m.home_score !== null && m.away_score !== null) {
        const report = reportMap[m.id];
        if (report) {
          const actual = actualResult(m.home_score, m.away_score);
          // 比分命中：报告预测比分与实际完全一致（格式 "1-1" 或 "1:1"）
          const normScore = report.score.replace("-", ":");
          const actualScore = `${m.home_score}:${m.away_score}`;
          const tgHit = report.total_goals !== "" &&
            report.total_goals === totalGoalsLabel(m.home_score, m.away_score);
          if (normScore === actualScore) {
            modelHit = "score";
          } else if (actual && report.result.includes(actual === "主队胜" ? "主队胜" : actual === "客队胜" ? "客队胜" : "平局")) {
            modelHit = "result";
          } else if (tgHit) {
            modelHit = "totalgoals";
          } else {
            modelHit = "miss"; // 预测全部未中，不展示
          }
        }
        // 没有报告 → modelHit 保持 null，前端显示默认"预测命中"
      }

      return {
        id: m.id,
        kickoff_at: m.kickoff_at,
        status: m.status,
        home_score: m.home_score,
        away_score: m.away_score,
        group_name: m.group_name,
        home: (m.home as unknown as { name_zh: string } | null)?.name_zh ?? "主队",
        away: (m.away as unknown as { name_zh: string } | null)?.name_zh ?? "客队",
        seed,
        winVotes: seed.win,
        lossVotes: seed.loss,
        modelHit,
        day,
      };
    });

    // 拉取 showcase 配置（未登录预览用），不存在时静默返回空数组
    let showcase: unknown[] = [];
    try {
      const { data: ss } = await db.from("site_settings").select("value").eq("key", "showcase_predictions").maybeSingle();
      if (ss?.value) showcase = ss.value as unknown[];
    } catch { /* 表不存在时忽略 */ }

    return NextResponse.json({ ok: true, feed, danmaku: allDanmaku, showcase });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "服务异常" }, { status: 500 });
  }
}
