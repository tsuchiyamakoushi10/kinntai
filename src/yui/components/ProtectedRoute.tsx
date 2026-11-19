"use client";

import { useEffect, useState } from "react";

import { Navigate } from "@/yui/router";
import { useAuth } from "@/yui/auth";
import type { Role } from "../types";

interface Props {
  allow: Role[];
  children: React.ReactNode;
}

export function homePath(role: Role) {
  if (role === "staff") return "/staff/home";
  if (role === "manager") return "/manager/home";
  return "/president/home";
}

export default function ProtectedRoute({ allow, children }: Props) {
  const { user, realUser, viewAs, setViewAs } = useAuth();
  // 社長がモード切替中に社長の画面 (CrossShift のサイドバーからなど) を開いたら社長モードに戻す。
  // 判定はページを開いたときだけ (モード切替の直後に、いま開いている社長画面が戻してしまわないように)
  const [backToPresident] = useState(
    () =>
      !!viewAs &&
      realUser?.role === "president" &&
      !!user &&
      !allow.includes(user.role) &&
      allow.includes("president"),
  );
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (backToPresident) {
      setViewAs(null);
      setRestored(true);
    }
  }, [backToPresident, setViewAs]);

  if (!user) return null;
  if (backToPresident && !restored) return null;
  if (!allow.includes(user.role)) {
    return <Navigate to={homePath(user.role)} replace />;
  }
  return <>{children}</>;
}
