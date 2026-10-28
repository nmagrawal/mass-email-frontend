import { Suspense } from "react";

import { DriverClient } from "@/components/driver/driver-client";

export default function DriverPage() {
  // useSearchParams (?run=) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DriverClient />
    </Suspense>
  );
}
