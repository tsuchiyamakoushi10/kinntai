"use client";

/**
 * 結いナビの AuthContext の置き換え。ログインは CrossShift のログインをそのまま使い、
 * 画面には「ログイン中の人」を結いナビの Staff の形で渡す。
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { yuiLogout } from "@/lib/yui/actions";

import type { Staff } from "./types";
import { currentStaff } from "./storage";

interface AuthContextValue {
  user: Staff | null;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Staff | null>(() => currentStaff());

  const logout = useCallback(() => {
    void yuiLogout();
  }, []);

  const refresh = useCallback(() => {
    const s = currentStaff();
    setUser(s ? { ...s } : null);
  }, []);

  const value = useMemo(() => ({ user, logout, refresh }), [user, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
