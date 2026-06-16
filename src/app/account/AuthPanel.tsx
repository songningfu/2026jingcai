"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId, setDeviceId, resetDeviceId } from "@/lib/device-id";
import { supabaseBrowser } from "@/lib/supabase-browser";

function Input({
  label, type = "text", value, onChange, placeholder, autoComplete,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint transition focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/10"
      />
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, busy }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled || busy}
      className="w-full rounded-xl bg-neon py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:bg-raised disabled:text-faint"
    >
      {busy ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          处理中…
        </span>
      ) : children}
    </button>
  );
}

export default function AuthPanel({ onAuthChange, hideTitle }: { onAuthChange: () => void; hideTitle?: boolean }) {
  const [isRegister, setIsRegister] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [loggedInfo, setLoggedInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "ok">("error");
  const [ready, setReady] = useState(true);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) { setInviteCode(ref.toUpperCase()); setIsRegister(true); }
  }, []);

  useEffect(() => {
    let active = true;
    const timeout = new Promise<void>(r => setTimeout(r, 3000));
    Promise.race([
      supabaseBrowser().auth.getSession().then(async ({ data }) => {
        if (!active) return;
        try {
          if (data.session) {
            const res = await fetch("/api/account/me", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId: getDeviceId() }),
            });
            const d = await res.json();
            const acc = d.account;
            if (acc) {
              if (acc.username) setLoggedInfo(`@${acc.username}`);
              else if (acc.email && !acc.email.includes("@internal.qiuyi.app")) setLoggedInfo(acc.email);
              else setLoggedInfo(acc.nickname ?? "已登录");
            }
          }
        } catch { /* ignore */ }
      }),
      timeout,
    ]).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const ok = (m: string) => { setMsg(m); setMsgType("ok"); };
  const err = (m: string) => { setMsg(m); setMsgType("error"); };

  const finishLogin = useCallback(async (accessToken: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch("/api/account/link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), accessToken }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const data = await res.json();
      if (!data.ok) { err(data.error ?? "账号关联失败"); return; }
      setDeviceId(data.accountId);
      ok(data.upgraded ? "登录成功，积分与记录已绑定" : "登录成功");
      onAuthChange();
    } catch (e) {
      err(e instanceof Error && e.name === "AbortError" ? "网络超时，请重试" : "账号关联失败，请重试");
    }
  }, [onAuthChange]);

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy(true); setMsg("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) err(error.message);
    else { setCodeSent(true); ok("验证码已发到邮箱"); }
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true); setMsg("");
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) { err("验证码错误"); return; }
    setCodeVerified(true);
    ok("邮箱已验证 ✓");
  };

  const login = async () => {
    if (!username.trim() || password.length < 6) return;
    if (!agreed) { err("请先同意服务条款"); return; }
    setBusy(true); setMsg("");
    try {
      // 第一步：用户名 → 内部邮箱
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 10000);
      const r = await fetch("/api/account/username-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
        signal: ctrl1.signal,
      });
      clearTimeout(t1);
      const d = await r.json();
      if (!d.ok) { err(d.error ?? "用户名不存在"); return; }

      // 第二步：服务端中转登录（香港→Supabase，绕过中国直连高延迟）
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 20000);
      const authRes = await fetch("/api/account/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalEmail: d.internalEmail, password }),
        signal: ctrl2.signal,
      });
      clearTimeout(t2);
      const authData = await authRes.json();
      if (!authData.ok) { err(authData.error ?? "密码错误"); return; }

      // 关键账号关联只需 accessToken（走服务端），先做，保证登录成功
      setLoggedInfo(`@${username.trim()}`);
      await finishLogin(authData.accessToken);
      // 浏览器端 session 持久化：国内直连 Supabase 可能很慢/挂起，
      // 改为后台尽力而为，绝不阻塞登录成功（否则按钮会永远卡在「处理中…」）
      void supabaseBrowser()
        .auth.setSession({
          access_token: authData.accessToken,
          refresh_token: authData.refreshToken,
        })
        .catch(() => {});
    } catch (e) {
      err(e instanceof Error && e.name === "AbortError" ? "网络超时，请重试" : "登录失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!username.trim() || password.length < 6) return;
    if (!agreed) { err("请先同意服务条款"); return; }
    setBusy(true); setMsg("");
    try {
      if (email.trim() && code.trim()) {
        const { error: otpErr } = await supabaseBrowser().auth.verifyOtp({
          email: email.trim(), token: code.trim(), type: "email",
        });
        if (otpErr) { err("验证码错误或已过期"); return; }
      }
      const deviceId = getDeviceId();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch("/api/account/username-register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, username: username.trim(), password }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const d = await r.json();
      if (!d.ok) { err(d.error ?? "注册失败"); return; }

      // 服务端中转登录
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 20000);
      const authRes = await fetch("/api/account/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalEmail: d.internalEmail, password }),
        signal: ctrl2.signal,
      });
      clearTimeout(t2);
      const authData = await authRes.json();
      if (!authData.ok) { err(authData.error ?? "登录失败"); return; }
      void supabaseBrowser()
        .auth.setSession({
          access_token: authData.accessToken,
          refresh_token: authData.refreshToken,
        })
        .catch(() => {});
      if (inviteCode.trim()) {
        fetch("/api/games/invite", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, code: inviteCode.trim() }),
        }).catch(() => {});
      }
      setLoggedInfo(`@${username.trim()}`);
      await finishLogin(authData.accessToken);
    } catch (e) {
      err(e instanceof Error && e.name === "AbortError" ? "网络超时，请重试" : "注册失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    resetDeviceId();
    setLoggedInfo(null);
    setUsername(""); setPassword(""); setEmail(""); setCode("");
    setCodeSent(false); setBusy(false); setMsg("");
    onAuthChange();
  };

  const switchMode = (toRegister: boolean) => {
    setIsRegister(toRegister);
    setMsg(""); setCode(""); setCodeSent(false); setInviteCode("");
  };

  if (!ready) return (
    <div className="px-6 pb-8 pt-6 space-y-3">
      <div className="h-10 animate-pulse rounded-xl bg-raised" />
      <div className="h-10 animate-pulse rounded-xl bg-raised" />
      <div className="h-11 animate-pulse rounded-xl bg-raised" />
    </div>
  );

  /* ——— 已登录 ——— */
  if (loggedInfo) {
    return (
      <div className={hideTitle ? "px-5 pb-5" : "card mt-4 overflow-hidden"}>
        {!hideTitle && (
          <div className="border-b border-line px-6 py-5">
            <h2 className="text-base font-semibold text-ink">账号</h2>
          </div>
        )}
        <div className={hideTitle ? "" : "p-6"}>
          <div className="flex items-center gap-3 rounded-xl border border-neon/20 bg-neon/5 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neon/15 text-base font-bold text-neon">
              {loggedInfo[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{loggedInfo}</p>
              <p className="text-xs text-neon">已登录</p>
            </div>
            <button onClick={logout} disabled={busy}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-mut transition hover:border-live/40 hover:text-live disabled:opacity-50">
              退出
            </button>
          </div>
          <p className="mt-3 text-xs text-faint">积分与竞猜记录跨设备同步，换设备用同一账号登录即可找回。</p>
        </div>
      </div>
    );
  }

  /* ——— 未登录 ——— */
  return (
    <div className={hideTitle ? "px-5 pb-5" : "card mt-4 overflow-hidden"}>
      {!hideTitle && (
        <div className="border-b border-line px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neon text-xl font-bold text-white shadow-[0_4px_12px_rgba(12,157,104,0.3)]">
            译
          </div>
          <h2 className="text-lg font-bold text-ink">{isRegister ? "注册球译账号" : "登录球译账号"}</h2>
          <p className="mt-1 text-xs text-faint">登录后积分与竞猜记录跨设备同步</p>
        </div>
      )}

      <div className={hideTitle ? "pt-4" : "p-6"}>
        <div className="space-y-3">
          <Input label="用户名" value={username} onChange={setUsername}
            placeholder="2–16 位，支持中文 / 字母 / 数字 / _" autoComplete="username" />
          <Input label="密码" type="password" value={password} onChange={setPassword}
            placeholder="至少 6 位" autoComplete={isRegister ? "new-password" : "current-password"} />

          {/* 注册时额外的邮箱+验证码 */}
          {isRegister && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">邮箱</label>
                <div className="flex gap-2">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="用于找回账号（选填）" autoComplete="email"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint transition focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/10"
                  />
                  <button onClick={sendCode} disabled={!email.trim() || busy}
                    className="shrink-0 rounded-xl border border-neon/40 px-3 py-2 text-xs font-medium text-neon transition hover:bg-neon/5 disabled:opacity-40">
                    {codeSent ? "重发" : "发送"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">验证码</label>
                <input
                  value={code} onChange={e => setCode(e.target.value)}
                  placeholder={codeSent ? "6 位验证码" : "发送邮箱后填写"}
                  autoComplete="one-time-code" disabled={!codeSent}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint transition focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/10 disabled:opacity-40"
                />
              </div>

              <Input label="邀请码（选填）" value={inviteCode} onChange={setInviteCode}
                placeholder="6 位邀请码，填写双方各得积分" autoComplete="off" />
            </>
          )}

          {/* 同意条款 */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-raised/50 px-3 py-2.5">
            <input
              type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-neon"
            />
            <span className="text-[11px] leading-relaxed text-faint">
              我已阅读并同意
              <button
                type="button"
                onClick={e => { e.preventDefault(); setShowTerms(true); }}
                className="mx-0.5 font-medium text-neon underline underline-offset-2 hover:text-neon/80"
              >《用户服务条款》</button>——
              本站仅提供数据资讯与分析，积分纯虚拟不可提现，不构成任何购彩建议，不提供投注服务。
            </span>
          </label>

          {/* 条款弹窗 */}
          {showTerms && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
              <div className="absolute inset-0 bg-black/60" />
              <div className="relative max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowTerms(false)} className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-raised hover:text-ink">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
                </button>
                <h3 className="mb-4 text-base font-bold text-ink">用户服务条款</h3>
                <div className="space-y-3 text-xs leading-relaxed text-mut">
                  <p><strong className="text-ink">1. 服务性质</strong><br />本平台（球译）仅提供世界杯赛事数据资讯、概率分析与 AI 推演工具，属于信息服务，不提供任何形式的博彩、投注、购彩代理或相关中介服务。</p>
                  <p><strong className="text-ink">2. 免责声明</strong><br />平台所有概率、赔率、AI 推演结果均为数据模型测算，仅供参考，不代表真实赛事结果，不构成任何购彩建议。用户依据本平台信息做出的任何决策，后果由用户自行承担。</p>
                  <p><strong className="text-ink">3. 积分说明</strong><br />平台内虚拟积分为纯虚拟道具，不可充值、不可提现、不可兑换任何现金等价物或实物商品，仅用于平台内功能体验。</p>
                  <p><strong className="text-ink">4. 用户责任</strong><br />用户须年满 18 周岁方可使用本平台。用户应遵守所在地区法律法规，不得将本平台用于任何违法活动。</p>
                  <p><strong className="text-ink">5. 数据来源</strong><br />赔率数据来源于中国体彩竞彩官方渠道，AI 分析内容由大模型生成，平台不对数据准确性、完整性及时效性作出任何承诺。</p>
                  <p><strong className="text-ink">6. 条款更新</strong><br />本条款可能随产品迭代更新，继续使用即视为同意最新条款。</p>
                </div>
                <button
                  onClick={() => { setAgreed(true); setShowTerms(false); }}
                  className="mt-5 w-full rounded-xl bg-neon py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  我已阅读，同意条款
                </button>
              </div>
            </div>
          )}

          <PrimaryBtn
            onClick={isRegister ? register : login}
            busy={busy}
            disabled={!username.trim() || password.length < 6 || !agreed}
          >
            {isRegister ? "注册" : "登录"}
          </PrimaryBtn>

          <p className="text-center text-xs text-faint">
            {isRegister ? "已有账号？" : "还没有账号？"}
            <button onClick={() => switchMode(!isRegister)}
              className="ml-1 font-medium text-neon hover:underline">
              {isRegister ? "登录" : "注册"}
            </button>
          </p>
        </div>

        {msg && (
          <div className={`mt-3 rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
            msgType === "ok"
              ? "border border-neon/20 bg-neon/5 text-neon"
              : "border border-live/20 bg-live/5 text-live"
          }`}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
