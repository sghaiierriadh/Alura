"use client";

import {
  addKnowledgePair,
  deleteKnowledgePair,
  updateKnowledgePair,
} from "@/app/actions/update-knowledge";
import { LearningCenter } from "@/components/dashboard/LearningCenter";
import type { BusinessRecordListRow } from "@/lib/knowledge/fetch-business-records";
import type { FaqPair } from "@/lib/knowledge/faq-data";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type MainTab = "faq" | "catalogue";

type Props = {
  agentId: string;
  companyName: string;
  description: string;
  initialFaq: FaqPair[];
  /** Entrées `knowledge` avec `source = human_resolution` (résolution tickets). */
  learnedFromTickets: FaqPair[];
  businessRecords: BusinessRecordListRow[];
};

function formatMetadataCell(
  metadata: BusinessRecordListRow["metadata"],
): string {
  if (metadata == null) return "—";
  try {
    const s = JSON.stringify(metadata);
    return s.length > 96 ? `${s.slice(0, 96)}…` : s;
  } catch {
    return "—";
  }
}

function formatRecordDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

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
  agentId,
  companyName,
  description,
  initialFaq,
  learnedFromTickets,
  businessRecords,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("faq");
  const [items, setItems] = useState<FaqPair[]>(initialFaq);
  const [learned, setLearned] = useState<FaqPair[]>(learnedFromTickets);

  useEffect(() => {
    setLearned(learnedFromTickets);
  }, [learnedFromTickets]);
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

      <div
        className="mt-8 flex flex-wrap gap-2 border-b border-zinc-200/80 pb-px dark:border-zinc-800"
        role="tablist"
        aria-label="Sections base de connaissance"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "faq"}
          onClick={() => setMainTab("faq")}
          className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
            mainTab === "faq"
              ? "border border-b-0 border-zinc-200/90 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              : "border border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          FAQ & base
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "catalogue"}
          onClick={() => setMainTab("catalogue")}
          className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
            mainTab === "catalogue"
              ? "border border-b-0 border-zinc-200/90 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              : "border border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Catalogue & Données
        </button>
      </div>

      {mainTab === "catalogue" ? (
        <section className="mt-10 space-y-10" aria-labelledby="catalogue-donnees-heading">
          <div>
            <h2
              id="catalogue-donnees-heading"
              className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Catalogue & Données
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Import CSV et fiches validées depuis le centre d’apprentissage : suivi des suggestions
              et lecture des enregistrements <span className="font-mono text-zinc-600 dark:text-zinc-300">business_records</span>.
            </p>
          </div>
          <LearningCenter agentId={agentId} />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Enregistrements métier
            </h3>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {businessRecords.length === 0 ? (
                <p className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Aucun enregistrement pour l’instant. Importez un CSV depuis{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Paramètres</span>{" "}
                  (données structurées) ou validez une suggestion en fiche métier.
                </p>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/90 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Titre
                      </th>
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Description
                      </th>
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Valeur
                      </th>
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Catégorie
                      </th>
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Métadonnées
                      </th>
                      <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">
                        Créé le
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessRecords.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                      >
                        <td className="max-w-[180px] px-4 py-3 align-top font-medium text-zinc-900 dark:text-zinc-100">
                          <span className="line-clamp-3">{row.title || "—"}</span>
                        </td>
                        <td className="max-w-[220px] px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                          <span className="line-clamp-4">{row.description?.trim() || "—"}</span>
                        </td>
                        <td className="max-w-[140px] px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                          <span className="line-clamp-3">{row.value?.trim() || "—"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                          {row.category?.trim() || "—"}
                        </td>
                        <td className="max-w-[200px] px-4 py-3 align-top font-mono text-xs text-zinc-500 dark:text-zinc-500">
                          {formatMetadataCell(row.metadata)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-zinc-500 dark:text-zinc-500">
                          {formatRecordDate(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {mainTab === "faq" ? (
        <>
      {learned.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Apprises depuis les tickets
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Ces entrées proviennent de résolutions enregistrées dans le centre de tickets (source{" "}
            <span className="font-mono text-zinc-600 dark:text-zinc-300">human_resolution</span>) et
            sont utilisées par Alura dans le chat (RAG + embeddings).
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            {learned.map((item, index) => (
              <li
                key={`learned-${index}-${item.question.slice(0, 24)}`}
                className="flex flex-col rounded-2xl border border-emerald-900/20 bg-emerald-950/20 p-5 dark:border-emerald-800/30 dark:bg-emerald-950/25"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/95">
                  Ticket → connaissance
                </p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Question
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                  {item.question || "—"}
                </p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Réponse
                </p>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.answer || "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Questions & réponses (manuel)
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

      {items.length === 0 && learned.length === 0 ? (
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
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-8 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/40 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-950/30"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aucune entrée manuelle dans la FAQ éditable pour l’instant. Les entrées ci-dessus
            proviennent des tickets résolus.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-4 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Ajouter une entrée manuelle
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
        </>
      ) : null}
    </div>
  );
}
