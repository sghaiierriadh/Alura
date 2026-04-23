"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

type Props = {
  themeColor: string;
  agentName?: string | null;
};

export function DashboardEmptyState({ themeColor, agentName }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-xl backdrop-blur-xl dark:bg-slate-900/50"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full blur-3xl"
        style={{ backgroundColor: `${themeColor}40` }}
      />
      <div
        className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ring-1"
        style={{
          backgroundColor: `${themeColor}1A`,
          color: themeColor,
          boxShadow: `inset 0 0 0 1px ${themeColor}33`,
        }}
      >
        <Sparkles className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="relative mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Alura attend son premier visiteur.
      </h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        {agentName
          ? `Intégrez le script puis lancez une première conversation avec ${agentName} pour voir vos stats s'animer.`
          : "Intégrez le script pour voir vos stats s'animer."}
      </p>
    </motion.div>
  );
}
