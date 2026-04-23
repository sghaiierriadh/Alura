"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { promoteTimelineEntryToKnowledge } from "@/app/actions/promote-timeline-entry-to-knowledge";
import { updateComplaintTimelineState } from "@/app/actions/update-complaint-timeline-state";
import { updateLeadStatus } from "@/app/actions/update-lead-status";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TicketWithLead } from "@/lib/admin/dashboard-queries";
import {
  formatTimelineTimestamp,
  parseTimelineContent,
  type TimelineEntry,
} from "@/lib/tickets/parse-timeline";

type Props = {
  ticket: TicketWithLead | null;
  open: boolean;
  onClose: () => void;
};

type TimelineState = {
  handled: number[];
  internalNote: string;
  promoted: number[];
};

type StatusValue = "open" | "in_progress" | "resolved";

function dash(v: string | null | undefined) {
  const t = v?.trim();
  return t && t.length > 0 ? t : "—";
}

function normalizeStatus(s: string | null | undefined): StatusValue {
  if (s === "in_progress" || s === "resolved") return s;
  return "open";
}

function statusLabel(status: StatusValue): string {
  switch (status) {
    case "open":
      return "Ouvert";
    case "in_progress":
      return "En cours";
    case "resolved":
      return "Résolu";
  }
}

function readInitialState(ticket: TicketWithLead | null): TimelineState {
  const raw = (ticket?.metadata ?? {}) as Record<string, unknown>;
  const handled = Array.isArray(raw.handled)
    ? (raw.handled as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  const promoted = Array.isArray(raw.promoted)
    ? (raw.promoted as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  const note =
    typeof raw.internal_note === "string"
      ? raw.internal_note
      : ticket?.resolution_notes?.trim() ?? "";
  return {
    handled: Array.from(new Set(handled)).sort((a, b) => a - b),
    internalNote: note,
    promoted: Array.from(new Set(promoted)).sort((a, b) => a - b),
  };
}

export function TicketDetailSheet({ ticket, open, onClose }: Props) {
  const router = useRouter();
  const [saving, startSaveTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);

  const [state, setState] = useState<TimelineState>(() => readInitialState(ticket));
  const [serverStatus, setServerStatus] = useState<StatusValue>(
    () => normalizeStatus(ticket?.status),
  );
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<StatusValue, StatusValue>(
    serverStatus,
    (_prev, next) => next,
  );

  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedSignature = useRef<string>("");

  const timeline: TimelineEntry[] = useMemo(
    () => parseTimelineContent(ticket?.content ?? ""),
    [ticket?.content],
  );

  useEffect(() => {
    if (!open || !ticket) return;
    const initial = readInitialState(ticket);
    setState(initial);
    setServerStatus(normalizeStatus(ticket.status));
    lastSyncedSignature.current = JSON.stringify({
      handled: initial.handled,
      internal_note: initial.internalNote,
      promoted: initial.promoted,
    });
  }, [open, ticket]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const persistState = useCallback(
    (next: TimelineState) => {
      if (!ticket?.id) return;
      const signature = JSON.stringify({
        handled: next.handled,
        internal_note: next.internalNote,
        promoted: next.promoted,
      });
      if (signature === lastSyncedSignature.current) return;
      lastSyncedSignature.current = signature;
      startSaveTransition(async () => {
        const r = await updateComplaintTimelineState({
          complaintId: ticket.id,
          handled: next.handled,
          internalNote: next.internalNote.trim().length > 0 ? next.internalNote : null,
          promoted: next.promoted,
        });
        if (!r.ok) {
          toast.error(r.error);
        }
      });
    },
    [ticket?.id],
  );

  const applyStatus = useCallback(
    (target: StatusValue, note: string) => {
      if (!ticket?.id) return;
      if (target === optimisticStatus) return;
      if (target === "resolved" && note.trim().length < 1) {
        toast.error("Saisissez une note interne avant de marquer comme résolu.");
        return;
      }
      startStatusTransition(async () => {
        setOptimisticStatus(target);
        const r = await updateLeadStatus({
          complaintId: ticket.id,
          status: target,
          resolutionNotes: target === "resolved" ? note.trim() : null,
        });
        if (!r.ok) {
          toast.error(r.error);
          setOptimisticStatus(serverStatus);
          return;
        }
        setServerStatus(target);
        toast.success(`Statut : ${statusLabel(target)}`);
        router.refresh();
      });
    },
    [optimisticStatus, router, serverStatus, setOptimisticStatus, ticket?.id],
  );

  const toggleHandled = (index: number) => {
    setState((prev) => {
      const set = new Set(prev.handled);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      const next: TimelineState = {
        ...prev,
        handled: Array.from(set).sort((a, b) => a - b),
      };
      persistState(next);

      // Auto-résolution lorsque tous les blocs sont cochés.
      if (
        timeline.length > 0 &&
        next.handled.length === timeline.length &&
        optimisticStatus !== "resolved" &&
        next.internalNote.trim().length > 0
      ) {
        applyStatus("resolved", next.internalNote);
      }
      return next;
    });
  };

  const onNoteChange = (value: string) => {
    setState((prev) => {
      const next: TimelineState = { ...prev, internalNote: value };
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
      noteDebounceRef.current = setTimeout(() => persistState(next), 600);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    };
  }, []);

  const handleResolveSession = () => {
    applyStatus("resolved", state.internalNote);
  };

  const handlePromoteEntry = (entry: TimelineEntry) => {
    if (!ticket?.id) return;
    const note = state.internalNote.trim();
    if (note.length < 4) {
      toast.error("Saisissez une note interne d'au moins 4 caractères avant d'apprendre cette entrée.");
      return;
    }
    setPromotingIndex(entry.index);
    startSaveTransition(async () => {
      const r = await promoteTimelineEntryToKnowledge({
        complaintId: ticket.id,
        entryIndex: entry.index,
        question: entry.text,
        answer: note,
      });
      setPromotingIndex(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Entrée ajoutée à la base de connaissances.");
      setState((prev) => {
        const merged = new Set([...prev.promoted, ...r.promoted]);
        const next: TimelineState = {
          ...prev,
          promoted: Array.from(merged).sort((a, b) => a - b),
        };
        lastSyncedSignature.current = JSON.stringify({
          handled: next.handled,
          internal_note: next.internalNote,
          promoted: next.promoted,
        });
        return next;
      });
      router.refresh();
    });
  };

  const canResolveGlobally =
    optimisticStatus !== "resolved" && state.internalNote.trim().length > 0;

  return (
    <AnimatePresence>
      {open && ticket ? (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Détails du ticket"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[100] flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Ticket
                </p>
                <h2 className="mt-0.5 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {dash(ticket.leads?.full_name) !== "—"
                    ? ticket.leads?.full_name
                    : "Contact anonyme"}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Créé le {formatTimelineTimestamp(ticket.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Contact
                </p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    <dt className="sr-only">Nom</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {dash(ticket.leads?.full_name)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    <dt className="sr-only">Email</dt>
                    <dd className="truncate text-zinc-700 dark:text-zinc-300">
                      {dash(ticket.leads?.email)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    <dt className="sr-only">Téléphone</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {dash(ticket.leads?.phone)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Statut du ticket
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Mise à jour instantanée, synchronisée en base.
                    </p>
                  </div>
                  <Select
                    value={optimisticStatus}
                    onValueChange={(v) =>
                      applyStatus(v as StatusValue, state.internalNote)
                    }
                    disabled={statusPending || !ticket?.id}
                  >
                    <SelectTrigger
                      aria-label="Changer le statut du ticket"
                      className="h-9 w-full sm:w-44"
                    >
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Ouvert</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem
                        value="resolved"
                        disabled={state.internalNote.trim().length < 1}
                      >
                        Résolu
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Timeline
                  </h3>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {state.handled.length}/{timeline.length || 0} traité
                    {timeline.length > 1 ? "s" : ""}
                  </span>
                </div>

                {timeline.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                    Aucun contenu à afficher.
                  </p>
                ) : (
                  <ol className="relative space-y-3 border-l border-zinc-200 pl-5 dark:border-zinc-800">
                    {timeline.map((entry) => {
                      const isHandled = state.handled.includes(entry.index);
                      const isPromoted = state.promoted.includes(entry.index);
                      const isPromoting = promotingIndex === entry.index;
                      return (
                        <li key={entry.index} className="relative">
                          <span
                            className={`absolute -left-[27px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border ${
                              isHandled
                                ? "border-emerald-400 bg-emerald-500 text-white"
                                : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                            }`}
                            aria-hidden
                          >
                            {isHandled ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Clock className="h-2.5 w-2.5 text-zinc-400" />
                            )}
                          </span>
                          <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                {entry.index === 0 && !entry.timestamp
                                  ? "Message initial"
                                  : formatTimelineTimestamp(entry.timestamp)}
                              </span>
                              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={isHandled}
                                  onChange={() => toggleHandled(entry.index)}
                                  className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-400 dark:border-zinc-600"
                                />
                                Traité
                              </label>
                            </div>
                            <p
                              className={`whitespace-pre-wrap text-sm ${
                                isHandled
                                  ? "text-zinc-500 line-through dark:text-zinc-500"
                                  : "text-zinc-800 dark:text-zinc-100"
                              }`}
                            >
                              {entry.text}
                            </p>

                            {isHandled ? (
                              <div className="mt-1 flex items-center justify-end">
                                {isPromoted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    <Sparkles className="h-3 w-3" aria-hidden />
                                    Ajouté à la connaissance
                                  </span>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-7 gap-1.5 px-2 text-[11px]"
                                    onClick={() => handlePromoteEntry(entry)}
                                    disabled={
                                      isPromoting ||
                                      state.internalNote.trim().length < 4
                                    }
                                    title={
                                      state.internalNote.trim().length < 4
                                        ? "Renseignez une note interne suffisante pour apprendre cette entrée."
                                        : undefined
                                    }
                                  >
                                    <Sparkles className="h-3 w-3" aria-hidden />
                                    {isPromoting
                                      ? "Ajout…"
                                      : "Transformer en connaissance"}
                                  </Button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className="mt-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Note interne / Réponse à préparer
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Sauvegardé en base (debounced) — retrouvé à chaque ouverture.
                </p>
                <Textarea
                  value={state.internalNote}
                  onChange={(e) => onNoteChange(e.target.value)}
                  placeholder="Ex : Contact effectué avec Decathlon La Marsa, code régénéré et renvoyé au client…"
                  className="mt-2 min-h-[110px] text-sm"
                />
              </section>
            </div>

            <footer className="flex flex-col gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {saving
                  ? "Synchronisation…"
                  : `Statut courant : ${statusLabel(optimisticStatus)}`}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 text-xs"
                  onClick={onClose}
                  disabled={statusPending}
                >
                  Fermer
                </Button>
                <Button
                  type="button"
                  className="h-9 gap-1.5 text-xs"
                  onClick={handleResolveSession}
                  disabled={statusPending || !canResolveGlobally}
                  title={
                    optimisticStatus === "resolved"
                      ? "Session déjà résolue."
                      : canResolveGlobally
                        ? undefined
                        : "Saisissez une note interne avant de clôturer."
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Marquer la session comme résolue
                </Button>
              </div>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
