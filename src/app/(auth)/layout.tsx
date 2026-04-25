import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.1),transparent_60%)]" />
      <div className="absolute left-4 right-4 top-4 mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Alura
        </Link>
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
