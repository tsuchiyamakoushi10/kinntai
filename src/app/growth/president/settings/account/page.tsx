"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import PresidentAccount from "@/yui/pages/president/PresidentAccount";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <PresidentAccount />
    </ProtectedRoute>
  );
}
