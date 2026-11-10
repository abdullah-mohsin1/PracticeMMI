import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
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
        <header className="site-header">
          <div className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                MMI
              </span>
              <span className="brand-text">PracticeMMI</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
