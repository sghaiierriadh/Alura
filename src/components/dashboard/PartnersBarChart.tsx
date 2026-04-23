"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PartnerComplaintsPoint } from "@/lib/admin/analytics-queries";

type Props = {
  data: PartnerComplaintsPoint[];
  themeColor: string;
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
  payload?: Array<{ payload: PartnerComplaintsPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/90">
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{row.partner}</p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {row.count} réclamation{row.count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function PartnersBarChart({ data, themeColor }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:shadow-2xl sm:p-5 dark:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Top 5 Enseignes (Réclamations)
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Tickets regroupés par enseigne détectée
          </p>
        </div>
      </div>
      <div className="mt-4 h-[220px] w-full sm:h-[240px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            Aucune enseigne détectée pour le moment.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 6, right: 12, bottom: 4, left: 18 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#a1a1aa33" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#71717a" }} />
              <YAxis
                type="category"
                dataKey="partner"
                tick={{ fontSize: 11, fill: "#71717a" }}
                width={90}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff10" }} />
              <Bar
                dataKey="count"
                fill={hexToRgba(themeColor, 0.9)}
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.section>
  );
}
