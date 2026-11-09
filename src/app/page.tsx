import { Dashboard } from "@/components/dashboard/Dashboard";
import { SignedIn } from "@/components/SignedIn";

export default function HomePage() {
  return (
    <main>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </main>
  );
}
