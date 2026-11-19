"use client";

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
  const { user } = useAuth();
  if (!user) return null;
  if (!allow.includes(user.role)) {
    return <Navigate to={homePath(user.role)} replace />;
  }
  return <>{children}</>;
}
