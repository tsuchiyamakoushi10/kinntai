"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffHome from "@/yui/pages/staff/StaffHome";

export default function Page() {
  return (
    <ProtectedRoute allow={["staff"]}>
      <StaffHome />
    </ProtectedRoute>
  );
}
