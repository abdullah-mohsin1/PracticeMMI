import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PracticeMMI",
  description: "Private Multiple Mini Interview practice.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            PracticeMMI
          </Link>
          <nav className="row">
            <Link href="/questions/">Your questions</Link>
            <Link href="/practice/setup" className="btn btn-primary btn-small">
              Start practice
            </Link>
          </nav>
        </header>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
