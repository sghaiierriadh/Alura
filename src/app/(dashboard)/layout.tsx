import Link from "next/link";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            Alura — Espace client
          </span>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              href="/dashboard"
            >
              Tableau de bord
            </Link>
            <Link
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              href="/onboarding"
            >
              Onboarding
            </Link>
            <Link
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              href="/knowledge"
            >
              Connaissance
            </Link>
            <Link
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              href="/chat"
            >
              Chat
            </Link>
            <Link
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              href="/settings"
            >
              Paramètres
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
