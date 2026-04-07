"use client";

import {
  addKnowledgePair,
  deleteKnowledgePair,
  updateKnowledgePair,
} from "@/app/actions/update-knowledge";
import type { FaqPair } from "@/lib/knowledge/faq-data";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type Props = {
  companyName: string;
  description: string;
  initialFaq: FaqPair[];
};

function EditDialog({
  title,
  question,
  answer,
  onQuestionChange,
  onAnswerChange,
  onClose,
  onSave,
  saving,
}: {
  title: string;
  question: string;
  answer: string;
  onQuestionChange: (v: string) => void;
  onAnswerChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-dialog-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="faq-dialog-title"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {title}
        </h2>
        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="faq-q"
              className="block text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Question
            </label>
            <textarea
              id="faq-q"
              rows={2}
              value={question}
              onChange={(e) => onQuestionChange(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100"
              placeholder="Ex. Quels sont vos horaires ?"
            />
          </div>
          <div>
            <label
              htmlFor="faq-a"
              className="block text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Réponse
            </label>
            <textarea
              id="faq-a"
              rows={4}
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100"
              placeholder="Réponse claire pour votre conseiller Alura…"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function KnowledgeView({
  companyName,
  description,
  initialFaq,
}: Props) {
  const [items, setItems] = useState<FaqPair[]>(initialFaq);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = useCallback(() => {
    setDialogMode("add");
    setEditIndex(null);
    setQ("");
    setA("");
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((index: number) => {
    setDialogMode("edit");
    setEditIndex(index);
    setQ(items[index]?.question ?? "");
    setA(items[index]?.answer ?? "");
    setDialogOpen(true);
  }, [items]);

  const closeDialog = useCallback(() => {
    if (saving) return;
    setDialogOpen(false);
    setEditIndex(null);
  }, [saving]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (dialogMode === "add") {
        const res = await addKnowledgePair(q, a);
        if (res.ok) {
          setItems(res.items);
          toast.success("Entrée ajoutée.");
          setDialogOpen(false);
        } else {
          toast.error(res.error);
        }
      } else if (editIndex !== null) {
        const res = await updateKnowledgePair(editIndex, q, a);
        if (res.ok) {
          setItems(res.items);
          toast.success("Modifications enregistrées.");
          setDialogOpen(false);
        } else {
          toast.error(res.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }, [a, dialogMode, editIndex, q]);

  const handleDelete = useCallback(async (index: number) => {
    if (!window.confirm("Supprimer cette entrée de connaissance ?")) return;
    setSaving(true);
    try {
      const res = await deleteKnowledgePair(index);
      if (res.ok) {
        setItems(res.items);
        toast.success("Entrée supprimée.");
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div className="font-sans">
      <header className="border-b border-zinc-200/80 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
          Base de connaissance
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {companyName}
        </h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">
            Aucune description — complétez-la depuis l’onboarding si besoin.
          </p>
        )}
      </header>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Questions & réponses
        </h2>
        <button
          type="button"
          onClick={openAdd}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Ajouter une entrée
        </button>
      </div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-950/40"
        >
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Aucune question / réponse pour l’instant
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
            Ajoutez des paires pour enrichir les réponses d’Alura. Les données
            issues de l’onboarding apparaîtront ici une fois converties au format
            question / réponse.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-6 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Créer la première entrée
          </button>
        </motion.div>
      ) : (
        <motion.ul
          className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: { staggerChildren: 0.06 },
            },
          }}
        >
          {items.map((item, index) => (
            <motion.li
              key={`card-${index}-${item.answer.slice(0, 24)}`}
              layout="position"
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Question
                </p>
                <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                  {item.question || "—"}
                </p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Réponse
                </p>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.answer || "—"}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => openEdit(index)}
                    disabled={saving}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(index)}
                    disabled={saving}
                    className="rounded-lg border border-red-200/90 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Supprimer
                  </button>
                </div>
              </motion.li>
            ))}
        </motion.ul>
      )}

      <AnimatePresence>
        {dialogOpen ? (
          <EditDialog
            key="faq-edit"
            title={dialogMode === "add" ? "Nouvelle entrée" : "Modifier l’entrée"}
            question={q}
            answer={a}
            onQuestionChange={setQ}
            onAnswerChange={setA}
            onClose={closeDialog}
            onSave={() => void handleSave()}
            saving={saving}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
