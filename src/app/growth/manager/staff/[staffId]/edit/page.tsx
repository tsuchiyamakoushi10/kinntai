"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import StaffEdit from "@/yui/pages/manager/StaffEdit";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <StaffEdit />
    </ProtectedRoute>
  );
}
