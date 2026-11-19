"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffList from "@/yui/pages/president/StaffList";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <StaffList />
    </ProtectedRoute>
  );
}
