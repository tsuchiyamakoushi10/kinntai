"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffList from "@/yui/pages/manager/StaffList";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <StaffList />
    </ProtectedRoute>
  );
}
