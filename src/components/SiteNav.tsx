"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = ["Choose questions", "Check camera", "Practise"];

/** While a session is being set up, the header shows where you are instead of a button to start again. */
function stepFor(path: string): number {
  if (path.startsWith("/practice/setup")) return 0;
  if (path.startsWith("/practice/run")) return 1;
  return -1;
}

export function SiteNav() {
  const path = usePathname() ?? "/";
  const current = stepFor(path);

  if (current >= 0) {
    return (
      <nav aria-label="Practice steps">
        <ol className="steps">
          {STEPS.map((label, index) => {
            const state = index < current ? "done" : index === current ? "current" : "todo";
            return (
              <li key={label} className="step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span className="step-dot" aria-hidden="true">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className="step-label">{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav className="nav">
      <Link href="/questions/" className="nav-link" aria-current={path.startsWith("/questions") ? "page" : undefined}>
        Your questions
      </Link>
      <Link href="/practice/setup/" className="btn btn-gold btn-small">
        Start practice
      </Link>
    </nav>
  );
}
