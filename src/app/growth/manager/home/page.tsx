"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import ManagerHome from "@/yui/pages/manager/ManagerHome";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <ManagerHome />
    </ProtectedRoute>
  );
}
