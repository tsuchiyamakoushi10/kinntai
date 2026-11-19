"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffChart from "@/yui/pages/manager/StaffChart";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <StaffChart />
    </ProtectedRoute>
  );
}
