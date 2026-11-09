import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>PracticeMMI</h1>
      <p>Private Multiple Mini Interview practice.</p>
      <p>
        <Link href="/questions/">Your questions</Link>
      </p>
    </main>
  );
}
