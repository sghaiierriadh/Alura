"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MessagesByDayPoint } from "@/lib/admin/analytics-queries";

type Props = {
  data: MessagesByDayPoint[];
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
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/90">
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{label}</p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {value} message{value > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function MessagesActivityChart({ data, themeColor }: Props) {
  const gradientId = useMemo(
    () => `msgActivityGradient-${themeColor.replace("#", "")}`,
    [themeColor],
  );
  const total = useMemo(() => data.reduce((acc, p) => acc + p.count, 0), [data]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:shadow-2xl sm:p-5 dark:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Activité des messages
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            7 derniers jours · {total} message{total > 1 ? "s" : ""}
          </p>
        </div>
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: themeColor }}
        />
      </div>

      <div className="mt-4 h-[220px] w-full sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={themeColor} stopOpacity={0.55} />
                <stop offset="100%" stopColor={themeColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={hexToRgba("#a1a1aa", 0.2)}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: themeColor, strokeOpacity: 0.35 }} />
            <Area
              type="monotone"
              dataKey="count"
              stroke={themeColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, fill: themeColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}
