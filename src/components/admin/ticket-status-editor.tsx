"use client";

import { setTicketStatus, type TicketLifecycleStatus } from "@/app/actions/admin-tickets";
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
  const [resolutionDraft, setResolutionDraft] = useState(
    () => initialResolutionNotes?.trim() ?? "",
  );

  const applyNonResolved = (status: "open" | "in_progress") => {
    startTransition(async () => {
      const r = await setTicketStatus(complaintId, status, null);
      if (r.ok) {
        toast.success("Statut mis à jour");
        setResolving(false);
        router.refresh();
      } else {
        toast.error(r.error);
        router.refresh();
      }
    });
  };

  const submitResolved = () => {
    const note = resolutionDraft.trim();
    if (note.length < 1) {
      toast.error("Veuillez saisir une note de résolution.");
      return;
    }
    startTransition(async () => {
      const r = await setTicketStatus(complaintId, "resolved", note);
      if (r.ok) {
        toast.success("Ticket résolu et documenté");
        setResolving(false);
        router.refresh();
      } else {
        toast.error(r.error);
        router.refresh();
      }
    });
  };

  return (
    <div className="min-w-[11rem] space-y-2">
      <Select
        disabled={pending}
        value={serverStatus}
        onValueChange={(v) => {
          if (v === "resolved") {
            setResolving(true);
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
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Note de résolution <span className="text-red-500">*</span>
          </label>
          <Textarea
            value={resolutionDraft}
            onChange={(e) => setResolutionDraft(e.target.value)}
            placeholder="Décrivez la solution appliquée (sera utile pour Alura plus tard)…"
            className="mt-1.5 min-h-[88px] text-xs"
            required
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              disabled={pending}
              onClick={() => void submitResolved()}
            >
              Valider la résolution
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-3 text-xs"
              disabled={pending}
              onClick={() => {
                setResolving(false);
                setResolutionDraft(initialResolutionNotes?.trim() ?? "");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
