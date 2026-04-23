"use client";

import { Check, Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { exportLeadsCsv } from "@/app/actions/export-leads";

type Props = {
  themeColor: string;
  disabled?: boolean;
};

export function ExportLeadsButton({ themeColor, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      try {
        const res = await exportLeadsCsv();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDone(true);
        setTimeout(() => setDone(false), 2200);
      } catch (err) {
        console.error("[export-leads] unexpected error", err);
        setError("Export impossible.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur-md transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
        style={{
          boxShadow: `inset 0 0 0 1px ${themeColor}33`,
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : done ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden />
        ) : (
          <Download className="h-4 w-4" style={{ color: themeColor }} aria-hidden />
        )}
        <span>
          {pending ? "Export…" : done ? "Téléchargé" : "Exporter les leads"}
        </span>
      </button>
      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : null}
    </div>
  );
}
