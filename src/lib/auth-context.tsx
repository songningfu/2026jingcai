"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchLoginState } from "@/lib/account-status";

interface AuthCtx {
  loggedIn: boolean;
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<AuthCtx>({ loggedIn: false, loading: true, refresh: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    // 登录态以服务端账号为准，不依赖国内不可靠的 Supabase session
    const ok = await fetchLoginState();
    setLoggedIn(ok);
    setLoading(false);
  }, []);

  useEffect(() => {
    check();
    const { data: { subscription } } = supabaseBrowser().auth.onAuthStateChange(() => check());
    return () => subscription.unsubscribe();
  }, [check]);

  return <Ctx.Provider value={{ loggedIn, loading, refresh: check }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
