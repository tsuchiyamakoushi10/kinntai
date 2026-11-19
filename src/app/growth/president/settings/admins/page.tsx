"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import AdminMaster from "@/yui/pages/president/AdminMaster";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <AdminMaster />
    </ProtectedRoute>
  );
}
