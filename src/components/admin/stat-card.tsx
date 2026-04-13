import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  value: number;
  icon: LucideIcon;
  accent: "violet" | "amber" | "emerald";
};

const accents = {
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-300 dark:ring-violet-400/30",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30",
  emerald:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30",
};

export function StatCard({ title, value, icon: Icon, accent }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${accents[accent]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
