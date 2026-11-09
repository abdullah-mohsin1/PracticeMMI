import { Suspense } from "react";
import { PracticeSetup } from "@/components/practice/PracticeSetup";
import { LoadingRows } from "@/components/ui/states";

export default function PracticeSetupPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <PracticeSetup />
    </Suspense>
  );
}
