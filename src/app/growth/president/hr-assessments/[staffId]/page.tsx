"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import PresidentHRAssessmentDetail from "@/yui/pages/president/PresidentHRAssessmentDetail";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <PresidentHRAssessmentDetail />
    </ProtectedRoute>
  );
}
