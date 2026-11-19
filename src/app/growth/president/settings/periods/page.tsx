"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import PeriodSettings from "@/yui/pages/president/PeriodSettings";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <PeriodSettings />
    </ProtectedRoute>
  );
}
