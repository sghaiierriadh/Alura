"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { BookOpenCheck, CheckCircle2, MessageSquare, Users } from "lucide-react";
import { useEffect } from "react";

type Props = {
  totalLeads: number;
  totalConversations: number;
  resolutionRate: number;
  knowledgeBoost: number;
  themeColor: string;
};

function AnimatedNumber({
  value,
  suffix,
}: {
  value: number;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, {
    stiffness: 140,
    damping: 22,
    mass: 0.8,
  });
  const rounded = useTransform(spring, (latest) =>
    Math.round(Math.max(0, Number(latest) || 0)).toString(),
  );

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  return (
    <span className="flex items-baseline gap-1">
      <motion.span>{rounded}</motion.span>
      {suffix ? (
        <span className="text-lg font-medium text-zinc-400 dark:text-zinc-500">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

function GlassCard({
  title,
  icon,
  accentColor,
  children,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-3.5 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:shadow-2xl sm:p-5 dark:bg-slate-900/50"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}, ${accentColor}00)`,
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {title}
        </p>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1"
          style={{
            backgroundColor: `${accentColor}1A`,
            color: accentColor,
            boxShadow: `inset 0 0 0 1px ${accentColor}33`,
          }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums sm:mt-4 sm:text-4xl dark:text-zinc-50">
        {children}
      </div>
    </motion.div>
  );
}

export function AnimatedStatsCards({
  totalLeads,
  totalConversations,
  resolutionRate,
  knowledgeBoost,
  themeColor,
}: Props) {
  const conversationColor = "#3b82f6";
  const resolutionColor = "#10b981";
  const knowledgeColor = "#8b5cf6";
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <GlassCard
        title="Leads capturés"
        icon={<Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        accentColor={themeColor}
        delay={0}
      >
        <AnimatedNumber value={totalLeads} />
      </GlassCard>
      <GlassCard
        title="Conversations"
        icon={<MessageSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        accentColor={conversationColor}
        delay={0.08}
      >
        <AnimatedNumber value={totalConversations} />
      </GlassCard>
      <GlassCard
        title="Taux de résolution"
        icon={
          <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        }
        accentColor={resolutionColor}
        delay={0.16}
      >
        <AnimatedNumber value={resolutionRate} suffix="%" />
      </GlassCard>
      <GlassCard
        title="Knowledge Boost"
        icon={<BookOpenCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        accentColor={knowledgeColor}
        delay={0.24}
      >
        <AnimatedNumber value={knowledgeBoost} />
      </GlassCard>
    </div>
  );
}
