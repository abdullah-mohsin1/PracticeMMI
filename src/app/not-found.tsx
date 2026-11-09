import Link from "next/link";

export default function NotFound() {
  return (
    <main className="stack">
      <h1>Page not found</h1>
      <p>
        <Link href="/">Back to your questions</Link>
      </p>
    </main>
  );
}
