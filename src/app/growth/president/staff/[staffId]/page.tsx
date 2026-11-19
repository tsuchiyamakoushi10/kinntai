"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import ConfirmationDetail from "@/yui/pages/president/ConfirmationDetail";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <ConfirmationDetail />
    </ProtectedRoute>
  );
}
