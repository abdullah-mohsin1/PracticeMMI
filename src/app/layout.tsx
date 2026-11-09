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
          <Link href="/practice/setup" className="btn btn-primary btn-small">
            Start practice
          </Link>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
