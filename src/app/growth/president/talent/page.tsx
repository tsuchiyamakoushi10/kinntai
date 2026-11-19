"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import TalentDashboard from "@/yui/pages/president/TalentDashboard";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <TalentDashboard />
    </ProtectedRoute>
  );
}
