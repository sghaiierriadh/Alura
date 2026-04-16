"use client";

import { addKnowledgeFromResolution } from "@/app/actions/add-knowledge-from-resolution";
import {
  previewResolutionKnowledge,
  setTicketStatus,
  type TicketLifecycleStatus,
} from "@/app/actions/admin-tickets";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  complaintId: string;
  initialStatus: string;
  initialResolutionNotes?: string | null;
};

type ClosureSubstep = "note" | "preview";

function normalizeStatus(s: string): TicketLifecycleStatus {
  if (s === "in_progress" || s === "resolved") return s;
  return "open";
}

export function TicketStatusEditor({
  complaintId,
  initialStatus,
  initialResolutionNotes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const serverStatus = normalizeStatus(initialStatus);
  const [resolving, setResolving] = useState(false);
  const [closureSubstep, setClosureSubstep] = useState<ClosureSubstep>("note");
  const [resolutionDraft, setResolutionDraft] = useState(
    () => initialResolutionNotes?.trim() ?? "",
  );
  const [knowledgeDraft, setKnowledgeDraft] = useState<{
    question: string;
    answer: string;
  } | null>(null);
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false);

  const resetClosure = () => {
    setResolving(false);
    setClosureSubstep("note");
    setKnowledgeDraft(null);
    setResolutionConfirmed(false);
    setResolutionDraft(initialResolutionNotes?.trim() ?? "");
  };

  const applyNonResolved = (status: "open" | "in_progress") => {
    startTransition(async () => {
      const r = await setTicketStatus(complaintId, status, null);
      if (r.ok) {
        toast.success("Statut mis à jour");
        resetClosure();
        router.refresh();
      } else {
        toast.error(r.error);
        router.refresh();
      }
    });
  };

  const goToPreview = () => {
    const note = resolutionDraft.trim();
    if (note.length < 1) {
      toast.error("Veuillez saisir une note de résolution.");
      return;
    }
    startTransition(async () => {
      const r = await previewResolutionKnowledge(complaintId, note);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setKnowledgeDraft({ question: r.question, answer: r.answer });
      setClosureSubstep("preview");
    });
  };

  const confirmResolutionOnly = () => {
    const note = resolutionDraft.trim();
    if (note.length < 1) {
      toast.error("Veuillez saisir une note de résolution.");
      return;
    }
    startTransition(async () => {
      const r = await setTicketStatus(complaintId, "resolved", note);
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      toast.success("Ticket résolu et documenté");
      setResolutionConfirmed(true);
      router.refresh();
    });
  };

  const saveToKnowledge = () => {
    if (!knowledgeDraft) return;
    const q = knowledgeDraft.question.trim();
    const a = knowledgeDraft.answer.trim();
    if (q.length < 2 || a.length < 4) {
      toast.error("La question et la réponse doivent être suffisamment détaillées.");
      return;
    }
    startTransition(async () => {
      const r = await addKnowledgeFromResolution(complaintId, q, a);
      if (r.ok) {
        toast.success("Alura a appris cette résolution et l'utilisera désormais.");
        resetClosure();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  const finishWithoutKnowledge = () => {
    resetClosure();
    router.refresh();
  };

  return (
    <div className="min-w-[11rem] space-y-2">
      <Select
        disabled={pending || (resolving && closureSubstep === "preview")}
        value={resolving ? "resolved" : serverStatus}
        onValueChange={(v) => {
          if (v === "resolved") {
            setResolving(true);
            setClosureSubstep("note");
            setKnowledgeDraft(null);
            setResolutionConfirmed(false);
            setResolutionDraft((prev) => prev || (initialResolutionNotes?.trim() ?? ""));
            return;
          }
          void applyNonResolved(v as "open" | "in_progress");
        }}
      >
        <SelectTrigger aria-label="Statut du ticket" className="h-9">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Ouvert</SelectItem>
          <SelectItem value="in_progress">En cours</SelectItem>
          <SelectItem value="resolved">Résolu</SelectItem>
        </SelectContent>
      </Select>

      {resolving ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          {closureSubstep === "note" ? (
            <>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Note de résolution <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={resolutionDraft}
                onChange={(e) => setResolutionDraft(e.target.value)}
                placeholder="Décrivez la solution appliquée…"
                className="mt-1.5 min-h-[88px] text-xs"
                required
              />
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                Le ticket ne sera marqué résolu qu’après confirmation dans l’étape suivante.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-8 px-3 text-xs"
                  disabled={pending}
                  onClick={() => void goToPreview()}
                >
                  Suivant : aperçu Alura
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  disabled={pending}
                  onClick={() => resetClosure()}
                >
                  Annuler
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                Aperçu pour Alura
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                Modifiez la question et la réponse proposées par l’IA, puis confirmez la résolution du
                ticket et/ou publiez l’entrée dans la connaissance.
              </p>
              <div className="mt-2 rounded-lg border border-zinc-200/80 bg-white/60 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  Note de résolution (sera enregistrée avec le ticket)
                </p>
                <p className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">{resolutionDraft}</p>
              </div>
              <label className="mt-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Question
              </label>
              <Textarea
                value={knowledgeDraft?.question ?? ""}
                onChange={(e) =>
                  setKnowledgeDraft((d) =>
                    d ? { ...d, question: e.target.value } : { question: e.target.value, answer: "" },
                  )
                }
                className="mt-1 min-h-[52px] text-xs"
                rows={2}
              />
              <label className="mt-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Réponse
              </label>
              <Textarea
                value={knowledgeDraft?.answer ?? ""}
                onChange={(e) =>
                  setKnowledgeDraft((d) =>
                    d ? { ...d, answer: e.target.value } : { question: "", answer: e.target.value },
                  )
                }
                className="mt-1 min-h-[100px] text-xs"
                rows={5}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  disabled={pending}
                  onClick={() => {
                    setClosureSubstep("note");
                  }}
                >
                  Retour
                </Button>
                <Button
                  type="button"
                  className="h-8 px-3 text-xs"
                  disabled={pending || resolutionConfirmed}
                  onClick={() => void confirmResolutionOnly()}
                >
                  Confirmer la résolution
                </Button>
                <Button
                  type="button"
                  className="h-8 px-3 text-xs"
                  disabled={pending || !resolutionConfirmed}
                  onClick={() => void saveToKnowledge()}
                  title={
                    resolutionConfirmed
                      ? undefined
                      : "Confirmez d’abord la résolution du ticket pour publier cette entrée."
                  }
                >
                  Enregistrer dans la connaissance
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  disabled={pending}
                  onClick={() => finishWithoutKnowledge()}
                >
                  Fermer
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
