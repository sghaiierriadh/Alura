"use client";

import {
  listPendingLearningSuggestions,
  rejectLearningSuggestion,
  validateLearningSuggestionAsBusinessRecord,
  validateLearningSuggestionAsFaq,
} from "@/app/actions/save-learning-suggestion";
import type { LearningSuggestionRow } from "@/app/actions/save-learning-suggestion";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  agentId: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function LearningCenter({ agentId }: Props) {
  const [items, setItems] = useState<LearningSuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPendingLearningSuggestions(agentId);
      if (!res.ok) {
        toast.error(res.error);
        setItems([]);
        return;
      }
      setItems(res.suggestions);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (id: string, action: "faq" | "record" | "reject") => {
      if (busyId) return;
      setBusyId(id);
      try {
        let res: { ok: true } | { ok: false; error: string };
        if (action === "faq") {
          res = await validateLearningSuggestionAsFaq(id);
        } else if (action === "record") {
          res = await validateLearningSuggestionAsBusinessRecord(id);
        } else {
          res = await rejectLearningSuggestion(id);
        }
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          action === "reject"
            ? "Suggestion rejetée."
            : action === "faq"
              ? "Ajouté à la FAQ."
              : "Ajouté aux fiches métier.",
        );
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [busyId, refresh],
  );

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
        Chargement des suggestions…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        Aucune suggestion en attente. Les propositions apparaissent après une réponse enrichie par
        la recherche web (live search).
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((s) => (
        <li
          key={s.id}
          className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800/80">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {formatDate(s.created_at)} · {s.source}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Question</span>
              <p className="mt-0.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {s.user_question}
              </p>
            </div>
            <div>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Réponse proposée</span>
              <p className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                {s.suggested_answer}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void run(s.id, "record")}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {busyId === s.id ? "Patientez…" : "Valider → fiche métier"}
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void run(s.id, "faq")}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {busyId === s.id ? "Patientez…" : "Valider → FAQ"}
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void run(s.id, "reject")}
              className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/70"
            >
              {busyId === s.id ? "Patientez…" : "Rejeter"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
