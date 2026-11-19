"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import AdminEdit from "@/yui/pages/president/AdminEdit";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <AdminEdit />
    </ProtectedRoute>
  );
}
