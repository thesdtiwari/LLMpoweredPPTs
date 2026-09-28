import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="app-error">
      <h1>Page not found</h1>
      <Link href="/">Back to the editor</Link>
    </div>
  );
}
