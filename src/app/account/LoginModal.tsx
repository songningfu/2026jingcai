"use client";

import { useEffect } from "react";
import AuthPanel from "./AuthPanel";

export default function LoginModal({
  onClose,
  onAuthChange,
  onSuccess,
}: {
  onClose: () => void;
  onAuthChange?: () => void;
  onSuccess?: () => void;
}) {
  const handleAuth = () => {
    onAuthChange?.();
    onSuccess?.();
    onClose();
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface shadow-2xl sm:rounded-2xl" style={{ maxHeight: "90dvh" }}>
        {/* 顶部装饰条 */}
        <div className="h-1 w-full bg-gradient-to-r from-neon/60 via-neon to-neon/60" />
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-raised hover:text-ink transition-colors"
          aria-label="关闭"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M3 3l10 10M13 3L3 13"/>
          </svg>
        </button>
        <AuthPanel onAuthChange={handleAuth} />
      </div>
    </div>
  );
}
