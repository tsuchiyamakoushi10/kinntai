"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import Dashboard from "@/yui/pages/president/Dashboard";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <Dashboard />
    </ProtectedRoute>
  );
}
