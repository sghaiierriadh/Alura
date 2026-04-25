import Link from "next/link";
import { ArrowRight, BrainCircuit, LayoutDashboard, Sparkles, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 sm:py-14">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.1),transparent_60%)]" />
      <header className="mb-10 flex items-center justify-between">
        <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Alura</p>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/auth/login"
            className="rounded-xl border border-zinc-300/80 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Login
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Signup
          </Link>
        </div>
      </header>

      <section className="rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:p-12">
        <p className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" />
          Plateforme relation client intelligente
        </p>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Transformez chaque conversation en opportunité business mesurable.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-zinc-600 dark:text-zinc-300 sm:text-lg">
          Alura combine chatbot, capture de leads et pilotage des réclamations dans une expérience SaaS premium, claire et actionnable.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Se connecter
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-xl border border-zinc-300/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Créer un compte
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        {[
          {
            title: "Dashboard unifié",
            desc: "KPIs temps réel, suivi des tickets et performance globale sur une seule vue.",
            icon: LayoutDashboard,
          },
          {
            title: "Capture de leads",
            desc: "Centralisez les contacts qualifiés automatiquement pendant les conversations.",
            icon: Users,
          },
          {
            title: "Analyse intelligente",
            desc: "Classement des réclamations, insights par enseigne et boucle d’apprentissage continue.",
            icon: BrainCircuit,
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
          >
            <item.icon className="h-7 w-7 text-indigo-500 dark:text-indigo-300" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{item.desc}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
