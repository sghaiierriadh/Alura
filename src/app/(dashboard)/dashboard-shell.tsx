"use client";

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Sparkles,
  Ticket,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

const mainNav = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/tickets", label: "Tickets", icon: Ticket },
] as const;

const secondaryNav = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/knowledge", label: "Connaissance", icon: BookOpen },
  { href: "/onboarding", label: "Onboarding", icon: Sparkles },
  { href: "/settings", label: "Paramètres", icon: Settings },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      title={label}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />
      {!collapsed ? <span>{label}</span> : null}
    </Link>
  );
}

function SidebarLogout({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={loading}
      className={`flex items-center gap-2 rounded-xl text-left font-medium text-zinc-600 transition hover:bg-red-50 hover:text-red-800 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-200 ${
        compact
          ? "w-auto px-2.5 py-1.5 text-xs"
          : "w-full gap-3 px-3 py-2.5 text-sm"
      }`}
    >
      <LogOut
        className={`shrink-0 opacity-90 ${compact ? "h-4 w-4" : "h-5 w-5"}`}
        strokeWidth={1.75}
        aria-hidden
      />
      <span>{loading ? "Déconnexion…" : "Se déconnecter"}</span>
    </button>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground lg:flex-row">
      <aside className="hidden shrink-0 border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950 lg:block lg:w-60 lg:border-b-0 lg:border-r">
        <div className="sticky top-0 flex h-screen min-h-0 flex-col gap-6 px-3 py-6">
          <div className="px-2">
            <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-2.5 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                A
              </span>
              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Alura
              </span>
            </div>
          </div>
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Vue d’ensemble
            </p>
            <nav className="mt-2 flex flex-col gap-0.5" aria-label="Navigation principale">
              {mainNav.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </nav>
          </div>
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Mon agent
            </p>
            <nav className="mt-2 flex flex-col gap-0.5" aria-label="Navigation agent">
              {secondaryNav.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </nav>
          </div>
          <div className="mt-auto border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <SidebarLogout />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:hidden"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Alura
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Espace client
              </span>
              <div className="lg:hidden">
                <SidebarLogout compact />
              </div>
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[1px]"
            aria-label="Fermer le menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[86vw] max-w-[340px] border-r border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Menu</p>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                aria-label="Fermer le menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Vue d’ensemble
                </p>
                <nav className="mt-2 flex flex-col gap-0.5" aria-label="Navigation principale mobile">
                  {mainNav.map((item) => (
                    <div key={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <NavLink {...item} />
                    </div>
                  ))}
                </nav>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Mon agent
                </p>
                <nav className="mt-2 flex flex-col gap-0.5" aria-label="Navigation agent mobile">
                  {secondaryNav.map((item) => (
                    <div key={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <NavLink {...item} />
                    </div>
                  ))}
                </nav>
              </div>
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <SidebarLogout />
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
