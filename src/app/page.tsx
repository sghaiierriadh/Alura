import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Alura
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Squelette Next.js — espace client et widget.
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-center text-sm sm:flex-row sm:gap-6">
        <li>
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
            href="/dashboard"
          >
            Tableau de bord
          </Link>
        </li>
        <li>
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
            href="/onboarding"
          >
            Onboarding
          </Link>
        </li>
        <li>
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
            href="/settings"
          >
            Paramètres
          </Link>
        </li>
        <li>
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
            href="/embed"
          >
            Widget (embed)
          </Link>
        </li>
      </ul>
    </div>
  );
}
