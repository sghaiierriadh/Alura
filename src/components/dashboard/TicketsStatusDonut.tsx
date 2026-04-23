"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { TicketsByStatus } from "@/lib/admin/analytics-queries";

type Props = {
  data: TicketsByStatus;
  themeColor: string;
};

type Slice = {
  key: "open" | "inProgress" | "resolved";
  label: string;
  value: number;
  color: string;
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const v =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(99, 102, 241, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/90">
      <p className="font-medium text-zinc-700 dark:text-zinc-200">
        {slice.label}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {slice.value} ticket{slice.value > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function TicketsStatusDonut({ data, themeColor }: Props) {
  const openColor = hexToRgba(themeColor, 0.95);
  const progressColor = hexToRgba(themeColor, 0.72);
  const resolvedColor = hexToRgba(themeColor, 0.5);
  const slices = useMemo<Slice[]>(
    () => [
      { key: "open", label: "Ouverts", value: data.open, color: openColor },
      {
        key: "inProgress",
        label: "En cours",
        value: data.inProgress,
        color: progressColor,
      },
      {
        key: "resolved",
        label: "Résolus",
        value: data.resolved,
        color: resolvedColor,
      },
    ],
    [data, openColor, progressColor, resolvedColor],
  );
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const hasData = total > 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:shadow-2xl sm:p-5 dark:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Répartition des tickets
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} ticket{total > 1 ? "s" : ""} au total
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="relative h-[200px] w-full sm:h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={hasData ? slices : [{ key: "empty", label: "", value: 1, color: "#e4e4e7" }]}
                dataKey="value"
                innerRadius={62}
                outerRadius={90}
                paddingAngle={hasData ? 2 : 0}
                stroke="none"
                isAnimationActive
              >
                {(hasData
                  ? slices
                  : [{ key: "empty", label: "", value: 1, color: "#e4e4e7" }]
                ).map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
              {hasData ? <Tooltip content={<CustomTooltip />} /> : null}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {total}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              tickets
            </span>
          </div>
        </div>

        <ul className="flex flex-col gap-2 text-sm">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-zinc-600 dark:text-zinc-300">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                {s.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
