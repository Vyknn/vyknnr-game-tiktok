import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">⛏ Dig Party</h1>
      <div className="flex gap-4">
        <Link className="rounded-lg bg-amber-600 px-5 py-3 font-semibold" href="/control">แผงควบคุม</Link>
        <Link className="rounded-lg bg-zinc-700 px-5 py-3 font-semibold" href="/game">หน้าเกม (OBS)</Link>
      </div>
    </main>
  );
}
