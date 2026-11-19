"use client";

/**
 * 結いナビの AuthContext の置き換え。ログインは CrossShift のログインをそのまま使い、
 * 画面には「ログイン中の人」を結いナビの Staff の形で渡す。
 *
 * 社長は「モード切替」で管理者・職員の画面も開ける (結いナビの開発用モード切替を社長だけに残したもの)。
 * そのとき画面に渡す user は選んだ管理者・職員になる。社長はもともと全員のデータを持っているので、
 * 見えるデータは増えない。保存の権限は社長のまま (サーバー側で判定)。
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { yuiLogout } from "@/lib/yui/actions";

import type { Role, Staff } from "./types";
import { currentStaff, staffStore } from "./storage";

export interface ViewAs {
  role: Exclude<Role, "president">;
  staffId: string;
}

interface AuthContextValue {
  /** 画面に出す人 (社長がモード切替中なら選んだ管理者・職員) */
  user: Staff | null;
  /** 実際にログインしている人 */
  realUser: Staff | null;
  viewAs: ViewAs | null;
  setViewAs: (v: ViewAs | null) => void;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const VIEW_AS_KEY = "yui:view-as";

function loadViewAs(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY);
    return raw ? (JSON.parse(raw) as ViewAs) : null;
  } catch {
    return null;
  }
}

function saveViewAs(v: ViewAs | null) {
  try {
    if (v) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(VIEW_AS_KEY);
  } catch {
    // 保存できなくても画面は動く (読み直すと社長モードに戻るだけ)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [realUser, setRealUser] = useState<Staff | null>(() => currentStaff());
  const [viewAs, setViewAsState] = useState<ViewAs | null>(() =>
    currentStaff()?.role === "president" ? loadViewAs() : null,
  );
  // 保存のたびに表示を取り直すためのカウンタ
  const [version, setVersion] = useState(0);

  const setViewAs = useCallback((v: ViewAs | null) => {
    saveViewAs(v);
    setViewAsState(v);
  }, []);

  const logout = useCallback(() => {
    saveViewAs(null);
    void yuiLogout();
  }, []);

  const refresh = useCallback(() => {
    const s = currentStaff();
    setRealUser(s ? { ...s } : null);
    setVersion((n) => n + 1);
  }, []);

  const user = useMemo<Staff | null>(() => {
    if (!realUser) return null;
    if (realUser.role !== "president" || !viewAs) return realUser;
    const target = staffStore.get(viewAs.staffId);
    if (!target) return realUser;
    return { ...target, role: viewAs.role };
    // version: 保存後に取り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realUser, viewAs, version]);

  const value = useMemo(
    () => ({ user, realUser, viewAs, setViewAs, logout, refresh }),
    [user, realUser, viewAs, setViewAs, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
