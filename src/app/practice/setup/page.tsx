import { Suspense } from "react";
import { PracticeSetup } from "@/components/practice/PracticeSetup";
import { SignedIn } from "@/components/SignedIn";
import { LoadingRows } from "@/components/ui/states";

export default function PracticeSetupPage() {
  return (
    <main>
      <SignedIn>
        <Suspense fallback={<LoadingRows rows={6} />}>
          <PracticeSetup />
        </Suspense>
      </SignedIn>
    </main>
  );
}
