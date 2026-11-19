"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import HRAssessmentQueue from "@/yui/pages/president/HRAssessmentQueue";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <HRAssessmentQueue />
    </ProtectedRoute>
  );
}
