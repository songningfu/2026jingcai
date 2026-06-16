"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Code {
  id: number;
  code: string;
  tier: string;
  days: number;
  note: string | null;
  is_active: boolean;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
}

// ── 生成面板（Pro / Max 独立一栏）──────────────────────────────
function GenPanel({
  tier, secret, onGenerated,
}: {
  tier: "pro" | "max";
  secret: string;
  onGenerated: () => void;
}) {
  const [days, setDays] = useState(40);
  const [count, setCount] = useState(5);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");

  const isPro = tier === "pro";
  const accent = isPro ? "neon" : "amber";

  const generate = async () => {
    setLoading(true);
    setFresh([]);
    setSelected(new Set());
    const res = await fetch(`/api/admin/codes?secret=${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, days, count, note: note || undefined }),
    });
    const data = await res.json();
    if (data.codes) {
      setFresh(data.codes);
      setSelected(new Set(data.codes)); // 默认全选
      onGenerated();
    }
    setLoading(false);
  };

  const toggle = (c: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === fresh.length ? new Set() : new Set(fresh));

  const copySelected = () => {
    const label = isPro ? "Pro 会员" : "Max 会员";
    const lines = [
      `【${label}激活码 · ${days}天】`,
      ...[...selected],
    ].join("\n");
    navigator.clipboard.writeText(lines);
    setFlash("已复制");
    setTimeout(() => setFlash(""), 1500);
  };

  return (
    <div className={`card flex flex-col gap-4 p-5 border-t-2 ${isPro ? "border-t-neon" : "border-t-amber"}`}>
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <span className={`font-num text-xs font-bold tracking-widest ${isPro ? "text-neon" : "text-amber"}`}>
          {isPro ? "PRO" : "MAX"}
        </span>
        <span className="text-sm font-semibold text-ink">{isPro ? "Pro 会员" : "Max 会员"}</span>
      </div>

      {/* 参数行 */}
      <div className="flex flex-wrap gap-2">
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-neon/50">
          <option value={30}>30 天</option>
          <option value={40}>40 天（全程）</option>
          <option value={60}>60 天</option>
          <option value={90}>90 天</option>
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-1">
          {[1, 3, 5, 10, 20].map(n => (
            <button key={n} onClick={() => setCount(n)}
              className={`rounded-md px-2.5 py-1.5 text-sm font-semibold transition ${count === n ? (isPro ? "bg-neon/15 text-neon" : "bg-amber/15 text-amber") : "text-mut hover:text-ink"}`}>
              {n}
            </button>
          ))}
        </div>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="备注"
          className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-neon/50" />
        <button onClick={generate} disabled={loading}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 ${isPro ? "bg-neon" : "bg-amber"}`}>
          {loading ? "生成中…" : `生成 ${count} 个`}
        </button>
      </div>

      {/* 生成结果 */}
      {fresh.length > 0 && (
        <div className={`rounded-xl border p-4 ${isPro ? "border-neon/25 bg-neon/5" : "border-amber/25 bg-amber/5"}`}>
          {/* 操作栏 */}
          <div className="mb-3 flex items-center justify-between">
            <button onClick={toggleAll}
              className="text-xs text-mut hover:text-ink transition">
              {selected.size === fresh.length ? "取消全选" : `全选 (${fresh.length})`}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">已选 {selected.size}/{fresh.length}</span>
              <button onClick={copySelected} disabled={selected.size === 0}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  flash ? "bg-neon text-white" : isPro ? "bg-neon/15 text-neon hover:bg-neon/25" : "bg-amber/15 text-amber hover:bg-amber/25"
                }`}>
                {flash || `复制选中 (${selected.size})`}
              </button>
            </div>
          </div>

          {/* 激活码列表 */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {fresh.map(c => (
              <label key={c}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition ${
                  selected.has(c)
                    ? isPro ? "border-neon/40 bg-neon/8" : "border-amber/40 bg-amber/8"
                    : "border-line bg-surface opacity-50"
                }`}>
                <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)}
                  className="accent-neon h-3.5 w-3.5 shrink-0" />
                <span className={`font-num text-sm font-bold tracking-widest ${isPro ? "text-neon" : "text-amber"}`}>{c}</span>
              </label>
            ))}
          </div>

          {/* 预览文本 */}
          {selected.size > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-white/60 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">复制预览</p>
              <pre className="whitespace-pre-wrap font-mono text-xs text-ink leading-relaxed">
                {`【${isPro ? "Pro" : "Max"} 会员激活码 · ${days}天】\n${[...selected].join("\n")}`}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 历史列表 ─────────────────────────────────────────────────
function CodeList({ secret }: { secret: string }) {
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");
  const [copied, setCopied] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/codes?secret=${secret}`)
      .then(r => r.json())
      .then(d => setCodes(d.codes ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [secret]);

  const deactivate = async (id: number) => {
    if (!confirm("确定作废此激活码？")) return;
    await fetch(`/api/admin/codes?secret=${secret}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  };

  const filtered = codes.filter(c =>
    filter === "unused" ? (c.is_active && !c.used_at) :
    filter === "used" ? !!c.used_at : true
  );

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex gap-1">
          {(["all", "unused", "used"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs transition ${filter === f ? "bg-neon/10 font-semibold text-neon" : "text-mut hover:text-ink"}`}>
              {f === "all" ? `全部 (${codes.length})`
               : f === "unused" ? `未使用 (${codes.filter(c => c.is_active && !c.used_at).length})`
               : `已使用 (${codes.filter(c => !!c.used_at).length})`}
            </button>
          ))}
        </div>
        <button onClick={load} className="text-xs text-mut hover:text-ink">刷新</button>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-raised" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-faint">暂无数据</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-raised">
            <tr className="text-left text-xs text-faint">
              <th className="px-4 py-2 font-normal">激活码</th>
              <th className="px-2 py-2 font-normal">档位</th>
              <th className="px-2 py-2 font-normal">天数</th>
              <th className="px-2 py-2 font-normal">备注</th>
              <th className="px-2 py-2 font-normal">状态</th>
              <th className="px-2 py-2 font-normal">使用时间</th>
              <th className="px-2 py-2 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map(c => (
              <tr key={c.id} className={!c.is_active || c.used_at ? "opacity-50" : ""}>
                <td className="px-4 py-2.5">
                  <button onClick={() => copy(c.code)}
                    className="font-num font-semibold tracking-wider text-ink hover:text-neon transition">
                    {copied === c.code ? "已复制!" : c.code}
                  </button>
                </td>
                <td className="px-2 py-2.5">
                  <span className={`chip !text-[10px] ${c.tier === "max" ? "!text-amber" : "!text-neon"}`}>
                    {c.tier.toUpperCase()}
                  </span>
                </td>
                <td className="font-num px-2 py-2.5 text-mut">{c.days}天</td>
                <td className="px-2 py-2.5 text-xs text-faint">{c.note ?? "—"}</td>
                <td className="px-2 py-2.5">
                  {!c.is_active ? <span className="text-xs text-live">已作废</span>
                   : c.used_at ? <span className="text-xs text-faint">已使用</span>
                   : <span className="text-xs font-medium text-neon">可用</span>}
                </td>
                <td className="px-2 py-2.5 text-xs text-faint">{c.used_at ? fmtDate(c.used_at) : "—"}</td>
                <td className="px-2 py-2.5">
                  {c.is_active && !c.used_at && (
                    <button onClick={() => deactivate(c.id)} className="text-[11px] text-live hover:underline">作废</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────
function CodesPanel() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/dashboard?secret=${secret}`} className="text-xs text-mut hover:text-ink">← 返回总览</Link>
        <h1 className="text-xl font-bold text-ink">激活码管理</h1>
      </div>

      {/* 双栏生成区 */}
      <div className="grid gap-4 md:grid-cols-2">
        <GenPanel tier="pro" secret={secret} onGenerated={refresh} />
        <GenPanel tier="max" secret={secret} onGenerated={refresh} />
      </div>

      {/* 历史列表 */}
      <CodeList key={tick} secret={secret} />
    </div>
  );
}

export default function CodesPage() {
  return <Suspense><CodesPanel /></Suspense>;
}
