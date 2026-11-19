"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import Settings from "@/yui/pages/president/Settings";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <Settings />
    </ProtectedRoute>
  );
}
