"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import InterviewForm from "@/yui/pages/staff/InterviewForm";

export default function Page() {
  return (
    <ProtectedRoute allow={["staff"]}>
      <InterviewForm />
    </ProtectedRoute>
  );
}
