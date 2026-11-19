"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffAdd from "@/yui/pages/manager/StaffAdd";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <StaffAdd />
    </ProtectedRoute>
  );
}
