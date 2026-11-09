import { Suspense } from "react";
import { SessionView } from "@/components/sessions/SessionView";
import { LoadingRows } from "@/components/ui/states";

export default function SessionViewPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <SessionView />
    </Suspense>
  );
}
