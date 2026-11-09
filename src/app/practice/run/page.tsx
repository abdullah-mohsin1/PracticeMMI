import { Suspense } from "react";
import { RunPractice } from "@/components/practice/RunPractice";
import { LoadingRows } from "@/components/ui/states";

export default function RunPracticePage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <RunPractice />
    </Suspense>
  );
}
