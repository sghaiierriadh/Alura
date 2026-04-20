"use client";

import { importBusinessRecords } from "@/app/actions/import-business-records";
import Papa from "papaparse";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

type Props = {
  agentId: string;
};

type UploadPhase = "idle" | "uploading" | "success";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(s: string): string {
  return stripAccents(s.trim().toLowerCase()).replace(/[^a-z0-9]+/g, "");
}

const FIELD_ALIASES: Record<"title" | "description" | "value" | "category" | "metadata", string[]> = {
  title: [
    "title",
    "titre",
    "nom",
    "name",
    "produit",
    "product",
    "article",
    "libelle",
    "libellé",
    "intitule",
    "intitulé",
    "label",
    "designation",
    "désignation",
    "raison sociale",
    "offre",
  ],
  description: [
    "description",
    "desc",
    "details",
    "détails",
    "detail",
    "resume",
    "résumé",
    "commentaire",
    "info",
    "information",
    "texte",
  ],
  value: [
    "value",
    "valeur",
    "montant",
    "amount",
    "prix",
    "price",
    "quantite",
    "quantité",
    "quantity",
    "total",
    "remise",
    "pourcentage",
  ],
  category: [
    "category",
    "categorie",
    "catégorie",
    "type",
    "famille",
    "rayon",
    "groupe",
    "segment",
    "rubrique",
    "theme",
    "thème",
  ],
  metadata: ["metadata", "meta", "tags", "extras", "attributs", "json", "donnees", "données"],
};

type ColumnMapping = {
  title: string | null;
  description: string | null;
  value: string | null;
  category: string | null;
  metadata: string | null;
};

function scoreHeaderForField(headerNorm: string, aliases: string[]): number {
  let best = 0;
  for (const a of aliases) {
    const an = normalizeKey(a);
    if (!an) continue;
    if (headerNorm === an) best = Math.max(best, 100);
    else if (headerNorm.includes(an) || an.includes(headerNorm)) best = Math.max(best, 52);
    else if (an.length >= 4 && (headerNorm.startsWith(an) || an.startsWith(headerNorm)))
      best = Math.max(best, 35);
  }
  return best;
}

function detectColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {
    title: null,
    description: null,
    value: null,
    category: null,
    metadata: null,
  };

  const fields: (keyof ColumnMapping)[] = [
    "title",
    "description",
    "value",
    "category",
    "metadata",
  ];

  for (const field of fields) {
    let bestHeader: string | null = null;
    let bestScore = 0;
    const aliases = FIELD_ALIASES[field];
    for (const h of headers) {
      if (used.has(h)) continue;
      const hn = normalizeKey(h);
      if (!hn) continue;
      const s = scoreHeaderForField(hn, aliases);
      if (s > bestScore) {
        bestScore = s;
        bestHeader = h;
      }
    }
    if (bestHeader && bestScore >= 35) {
      mapping[field] = bestHeader;
      used.add(bestHeader);
    }
  }

  if (!mapping.title && headers.length > 0) {
    const first = headers.find((h) => !used.has(h) && normalizeKey(h).length > 0) ?? headers[0];
    if (first) {
      mapping.title = first;
      used.add(first);
    }
  }

  return mapping;
}

function mappingSummary(m: ColumnMapping): string {
  const parts: string[] = [];
  if (m.title) parts.push(`titre ← « ${m.title} »`);
  if (m.description) parts.push(`description ← « ${m.description} »`);
  if (m.value) parts.push(`valeur ← « ${m.value} »`);
  if (m.category) parts.push(`catégorie ← « ${m.category} »`);
  if (m.metadata) parts.push(`métadonnées ← « ${m.metadata} »`);
  return parts.length > 0 ? parts.join(" · ") : "Aucune correspondance automatique (première colonne = titre).";
}

function csvRowToPayload(
  row: Record<string, unknown>,
  headers: string[],
  mapping: ColumnMapping,
): Record<string, unknown> {
  const get = (col: string | null): string | null => {
    if (!col) return null;
    const v = row[col];
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  const title = get(mapping.title);
  if (!title) return {};

  const out: Record<string, unknown> = {
    title,
    description: get(mapping.description),
    value: get(mapping.value),
    category: get(mapping.category),
  };

  const mappedCols = new Set(
    [mapping.title, mapping.description, mapping.value, mapping.category, mapping.metadata].filter(
      Boolean,
    ) as string[],
  );

  const extra: Record<string, unknown> = {};
  for (const h of headers) {
    if (mappedCols.has(h)) continue;
    const v = get(h);
    if (v !== null) extra[h] = v;
  }

  const metaCol = mapping.metadata;
  if (metaCol) {
    const raw = row[metaCol];
    const str = raw !== null && raw !== undefined ? String(raw).trim() : "";
    if (str) {
      try {
        const parsed: unknown = JSON.parse(str);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          out.metadata = { ...(parsed as Record<string, unknown>), ...extra };
        } else {
          out.metadata = Object.keys(extra).length ? { value: parsed, ...extra } : { value: parsed };
        }
      } catch {
        out.metadata = Object.keys(extra).length ? { texte: str, ...extra } : { texte: str };
      }
    } else if (Object.keys(extra).length > 0) {
      out.metadata = extra;
    }
  } else if (Object.keys(extra).length > 0) {
    out.metadata = extra;
  }

  return out;
}

export function BusinessRecordsUpload({ agentId }: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [lastMappingHint, setLastMappingHint] = useState<string | null>(null);

  const disabled = phase === "uploading";

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file || !file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Choisissez un fichier CSV (.csv).");
        return;
      }

      setPhase("uploading");
      setLastCount(null);
      setLastMappingHint(null);

      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: "greedy",
        encoding: "UTF-8",
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
              const fatal = results.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
              if (fatal) {
                toast.error(fatal.message || "Erreur de lecture du CSV.");
                setPhase("idle");
                return;
              }
            }

            const rows = results.data.filter(
              (r) => r && typeof r === "object" && Object.keys(r as object).length > 0,
            ) as Record<string, unknown>[];

            if (rows.length === 0) {
              toast.error("Le fichier ne contient aucune ligne de données.");
              setPhase("idle");
              return;
            }

            const headers = results.meta.fields?.filter((h): h is string => typeof h === "string" && h.trim().length > 0) ?? Object.keys(rows[0] ?? {});

            const mapping = detectColumnMapping(headers);
            setLastMappingHint(mappingSummary(mapping));

            const payload = rows
              .map((row) => csvRowToPayload(row, headers, mapping))
              .filter((o) => Object.keys(o).length > 0);

            if (payload.length === 0) {
              toast.error("Impossible d’extraire de titres : vérifiez les en-têtes de colonnes.");
              setPhase("idle");
              return;
            }

            const res = await importBusinessRecords(agentId, payload);
            if (!res.success) {
              toast.error(res.error);
              setPhase("idle");
              return;
            }

            setLastCount(res.count);
            setPhase("success");
            if (res.count === 0) {
              toast.success("Import terminé : anciennes données effacées (aucune ligne valide).");
            } else {
              toast.success("Import réussi.");
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Erreur inattendue.";
            toast.error(msg);
            setPhase("idle");
          } finally {
            if (fileRef.current) fileRef.current.value = "";
          }
        },
        error: (err) => {
          toast.error(err.message || "Lecture du fichier impossible.");
          setPhase("idle");
          if (fileRef.current) fileRef.current.value = "";
        },
      });
    },
    [agentId],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      void handleFile(f);
    },
    [handleFile],
  );

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <FileSpreadsheet className="h-5 w-5 text-zinc-600 dark:text-zinc-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Import CSV — enregistrements métier
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Les lignes existantes pour cet agent sont remplacées à chaque import. Colonnes reconnues
            automatiquement (ex. <span className="font-medium">Nom</span>,{" "}
            <span className="font-medium">Produit</span> → titre).
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id={inputId}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={disabled}
              onChange={onInputChange}
            />
            <label
              htmlFor={inputId}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 ${
                disabled ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {phase === "uploading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  Choisir un fichier CSV
                </>
              )}
            </label>
          </div>

          {phase === "uploading" && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
              Uploading… analyse du fichier et envoi au serveur.
            </p>
          )}

          {lastMappingHint && (phase === "uploading" || phase === "success") && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{lastMappingHint}</p>
          )}

          {phase === "success" && lastCount !== null && (
            <p
              className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
            >
              {lastCount === 0
                ? "Import terminé avec succès : les anciennes données ont été supprimées (aucune ligne valide dans le fichier)."
                : `Import terminé avec succès : ${lastCount} enregistrement${lastCount !== 1 ? "s" : ""} enregistré${lastCount !== 1 ? "s" : ""}.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
