"use client";

import { useAuth } from "@/yui/auth";
import { homePath } from "@/yui/components/ProtectedRoute";
import { Navigate } from "@/yui/router";

/** /growth → 役割ごとのホーム (結いナビの RoleHomeRedirect) */
export default function Page() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={homePath(user.role)} replace />;
}
