"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import HRAssessmentPage from "@/yui/pages/manager/HRAssessmentPage";

export default function Page() {
  return (
    <ProtectedRoute allow={["manager", "president"]}>
      <HRAssessmentPage />
    </ProtectedRoute>
  );
}
