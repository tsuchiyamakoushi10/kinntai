"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import InterviewDetail from "@/yui/pages/manager/InterviewDetail";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager"]}>
      <InterviewDetail />
    </ProtectedRoute>
  );
}
