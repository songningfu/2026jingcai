"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import LoginModal from "@/app/account/LoginModal";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { loggedIn, loading, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (loading) return null;

  if (!loggedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neon/10 text-3xl">🔒</div>
        <div>
          <p className="text-lg font-bold text-ink">登录后可使用此功能</p>
          <p className="mt-1.5 text-sm text-faint">赛程和赔率工具无需登录，其他功能需要账号</p>
        </div>
        <button
          onClick={() => setShowLogin(true)}
          className="rounded-full bg-neon px-8 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          登录 / 注册
        </button>
        {showLogin && (
          <LoginModal
            onClose={() => setShowLogin(false)}
            onAuthChange={() => { refresh(); setShowLogin(false); }}
          />
        )}
      </div>
    );
  }

  return <>{children}</>;
}
