"use client";

import ProtectedRoute from "@/yui/components/ProtectedRoute";
import ReviewQueue from "@/yui/pages/president/ReviewQueue";

export default function Page() {
  return (
    <ProtectedRoute allow={["president"]}>
      <ReviewQueue />
    </ProtectedRoute>
  );
}
