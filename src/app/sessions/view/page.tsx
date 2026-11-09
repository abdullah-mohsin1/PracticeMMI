import { Suspense } from "react";
import { SessionView } from "@/components/sessions/SessionView";
import { SignedIn } from "@/components/SignedIn";
import { LoadingRows } from "@/components/ui/states";

export default function SessionViewPage() {
  return (
    <main>
      <SignedIn>
        <Suspense fallback={<LoadingRows rows={6} />}>
          <SessionView />
        </Suspense>
      </SignedIn>
    </main>
  );
}
