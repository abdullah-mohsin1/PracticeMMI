import { Suspense } from "react";
import { RunPractice } from "@/components/practice/RunPractice";
import { SignedIn } from "@/components/SignedIn";
import { LoadingRows } from "@/components/ui/states";

export default function RunPracticePage() {
  return (
    <main>
      <SignedIn>
        <Suspense fallback={<LoadingRows rows={6} />}>
          <RunPractice />
        </Suspense>
      </SignedIn>
    </main>
  );
}
