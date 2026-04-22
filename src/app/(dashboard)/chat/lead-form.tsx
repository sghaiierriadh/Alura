"use client";

import { captureLead } from "@/app/actions/capture-lead";
import { motion } from "framer-motion";
import { useState, useTransition, type FormEvent } from "react";

type Props = {
  agentId: string;
  /** Session courante du chat — stockée sur le lead pour l’admin */
  sessionId?: string | null;
  /** Origine : widget | embed | dashboard | api | unknown */
  source?: string | null;
  lastQuestion: string | null;
  previousQuestion?: string | null;
  onSubmitted?: (payload: {
    email: string;
    phone: string;
    fullName: string;
    leadId: string;
  }) => void;
};

export function LeadForm({
  agentId,
  sessionId,
  source,
  lastQuestion,
  previousQuestion,
  onSubmitted,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [submitLocked, setSubmitLocked] = useState(false);

  const canSubmit =
    !isPending &&
    !submitLocked &&
    Boolean(sessionId?.trim()) &&
    (email.trim().length > 0 || phone.trim().length > 0);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    const resolvedSessionId = sessionId?.trim() || "";
    if (!resolvedSessionId) {
      setError("Session non prête. Réessayez dans 1 seconde.");
      return;
    }
    setSubmitLocked(true);
    setError(null);

    startTransition(async () => {
      console.log("[Alura chat] captureLead (formulaire)", {
        agentId,
        lastQuestionPreview:
          (lastQuestion ?? "").trim().slice(0, 120) || null,
      });
      const result = await captureLead({
        agentId,
        sessionId: resolvedSessionId,
        source: source?.trim() || null,
        fullName,
        email,
        phone,
        lastQuestion,
        previousQuestion,
      });

      if (!result.ok) {
        setError(result.error);
        setSubmitLocked(false);
        return;
      }

      setSubmitted(true);
      onSubmitted?.({
        email: email.trim(),
        phone: phone.trim(),
        fullName: fullName.trim(),
        leadId: result.leadId,
      });
    });
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200"
      >
        Merci, nous vous recontacterons !
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3 rounded-2xl border border-zinc-800/90 bg-zinc-900/70 p-4"
    >
      <div>
        <p className="text-sm font-medium text-zinc-100">
          Laissez vos coordonnées pour être recontacté
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Un expert vous rappellera rapidement.
        </p>
      </div>

      <div className="grid gap-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom complet (optionnel)"
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone"
          type="tel"
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
        />
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="h-10 w-full rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending || submitLocked ? "Envoi..." : "Être recontacté"}
      </button>
    </motion.form>
  );
}
