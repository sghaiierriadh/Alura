"use client";

import {
  analyzeDocument,
  type AnalyzeDocSuccess,
  type StrategicCategories,
} from "@/app/actions/analyze-doc";
import { saveAgent } from "@/app/actions/save-agent";
import { saveTemplateKnowledge } from "@/app/actions/save-template-knowledge";
import { saveWebsiteKnowledge } from "@/app/actions/save-website-knowledge";
import { exportLeadsCsv } from "@/app/actions/export-leads";
import { resetAgentAction } from "@/app/actions/reset-agent";
import type { PillarBlock } from "@/lib/knowledge/parse-pillars";
import type {
  CuratedFact,
  DetectedPage,
  ScrapeProgress,
  WebsiteScrapeResult,
} from "@/lib/ingestion/website-scraper";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function isValidWebUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const MAGIC_MESSAGES = [
  "🔍 Exploration de vos sources de données...",
  "🧠 Extraction des points clés de votre activité...",
  "🎭 Ajustement de la personnalité d'Alura...",
] as const;

const URL_MAGIC_MESSAGES = [
  "Exploration du site…",
  "Lecture des pages clés (FAQ, services, offres)…",
  "Analyse par Alura…",
] as const;

type StreamCallbacks = {
  onStage: (message: string) => void;
  onPages: (pages: DetectedPage[]) => void;
};

type StreamOutcome =
  | { ok: true; data: WebsiteScrapeResult }
  | { ok: false; error: string };

const PROFILE_PLACEHOLDER = "—";

/** Préfère la première valeur « utile » ; sinon la seconde (ex. fusion document + site). */
function coalesceProfileField(primary: string, secondary: string): string {
  const a = primary.trim();
  const b = secondary.trim();
  if (a && a !== PROFILE_PLACEHOLDER) return a;
  if (b && b !== PROFILE_PLACEHOLDER) return b;
  return a || b || PROFILE_PLACEHOLDER;
}

/** Jusqu’à 3 lignes en combinant deux listes (ordre : primary puis secondary). */
function mergeFaqHighlights(primary: string[], secondary: string[]): string[] {
  const pool = [...primary.filter((s) => s.trim().length > 0), ...secondary.filter((s) => s.trim().length > 0)];
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(pool[i] ?? "");
  return out;
}

async function runWebsiteAnalysisStream(
  url: string,
  cb: StreamCallbacks,
): Promise<StreamOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/onboarding/analyze-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Connexion impossible au service d’analyse.",
    };
  }

  if (!response.ok || !response.body) {
    let errorMessage = `Erreur serveur (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) errorMessage = payload.error;
    } catch {
      /* ignore */
    }
    return { ok: false, error: errorMessage };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: WebsiteScrapeResult | null = null;
  let streamError: string | null = null;

  const handleEvent = (event: ScrapeProgress) => {
    switch (event.type) {
      case "stage":
        cb.onStage(event.message);
        break;
      case "pages-detected":
        cb.onPages(event.pages);
        break;
      case "page-start":
        cb.onStage(event.message);
        break;
      case "page-done":
        break;
      case "curating":
        cb.onStage(event.message);
        break;
      case "done":
        finalResult = event.result;
        break;
      case "error":
        streamError = event.message;
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIndex = buffer.indexOf("\n");
    while (nlIndex !== -1) {
      const line = buffer.slice(0, nlIndex).trim();
      buffer = buffer.slice(nlIndex + 1);
      if (line.length > 0) {
        try {
          handleEvent(JSON.parse(line) as ScrapeProgress);
        } catch {
          /* ligne corrompue : on ignore */
        }
      }
      nlIndex = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    try {
      handleEvent(JSON.parse(tail) as ScrapeProgress);
    } catch {
      /* ignore */
    }
  }

  if (streamError) return { ok: false, error: streamError };
  if (!finalResult) {
    return {
      ok: false,
      error: "Flux interrompu avant la fin de l’analyse.",
    };
  }
  return { ok: true, data: finalResult };
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.25}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.25}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function SaveSpinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none ${className ?? ""}`}
      aria-hidden
    />
  );
}

function MagicSpinner() {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full bg-zinc-100/80 motion-safe:animate-pulse"
        aria-hidden
      />
      <div
        className="absolute inset-0 rounded-full border border-zinc-200/60 motion-safe:animate-ping motion-reduce:animate-none"
        style={{ animationDuration: "2s" }}
        aria-hidden
      />
      <div
        className="relative h-11 w-11 rounded-full border-2 border-zinc-200 border-t-zinc-900 motion-safe:animate-spin motion-reduce:animate-none"
        style={{ animationDuration: "1.1s" }}
      />
    </div>
  );
}

export function OnboardingPageClient({
  agentConfigured,
}: {
  agentConfigured: boolean;
}) {
  const router = useRouter();
  const [sourcesWizardOpen, setSourcesWizardOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [deleteLeadsOnReset, setDeleteLeadsOnReset] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState<string[]>([
    ...MAGIC_MESSAGES,
  ]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisKind, setAnalysisKind] = useState<"url" | "pdf" | null>(null);
  const [lastSource, setLastSource] = useState<"pdf" | "url" | "both" | null>(
    null,
  );
  const reduceMotion = useReducedMotion();

  const urlReady = useMemo(
    () => isValidWebUrl(siteUrl),
    [siteUrl],
  );
  const [messageVisible, setMessageVisible] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [faqHighlights, setFaqHighlights] = useState<string[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [templatePiliers, setTemplatePiliers] = useState<PillarBlock[]>([]);
  const [templatePillarsFound, setTemplatePillarsFound] = useState(0);
  const [documentReorganizedByAi, setDocumentReorganizedByAi] = useState(false);
  const [strategicPreview, setStrategicPreview] =
    useState<StrategicCategories | null>(null);
  const [websiteFacts, setWebsiteFacts] = useState<CuratedFact[]>([]);
  const [websitePages, setWebsitePages] = useState<DetectedPage[]>([]);
  const [urlLiveStage, setUrlLiveStage] = useState<string>("");

  useEffect(() => {
    if (!isAnalyzing) return;
    const id = window.setInterval(() => {
      setCurrentMessageIndex((i) => (i + 1) % loadingMessages.length);
    }, 2000);
    return () => clearInterval(id);
  }, [isAnalyzing, loadingMessages.length]);

  useEffect(() => {
    if (!isAnalyzing) return;
    setMessageVisible(false);
    const show = window.setTimeout(() => setMessageVisible(true), 45);
    return () => clearTimeout(show);
  }, [currentMessageIndex, isAnalyzing]);

  const startMagicAnalysis = useCallback(async () => {
    if (isAnalyzing) return;

    const urlTrim = siteUrl.trim();
    const useUrl = urlTrim.length > 0;
    const useFile = pdfFile != null;

    if (!useUrl && !useFile) {
      setAnalysisError(
        "Veuillez renseigner une URL ou sélectionner un fichier PDF ou DOCX.",
      );
      return;
    }

    const hadWebsiteBefore =
      websiteFacts.length > 0 || websitePages.length > 0;
    const hadTemplateBefore =
      templatePiliers.length > 0 || templatePillarsFound > 0;

    setAnalysisError(null);
    setAnalysisComplete(false);

    if (useFile && useUrl) {
      setCompanyName("");
      setSector("");
      setDescription("");
      setFaqHighlights([]);
      setTemplatePiliers([]);
      setTemplatePillarsFound(0);
      setDocumentReorganizedByAi(false);
      setStrategicPreview(null);
      setWebsiteFacts([]);
      setWebsitePages([]);
      setUrlLiveStage("");
      setLastSource(null);
    } else if (useUrl && !useFile) {
      setWebsiteFacts([]);
      setWebsitePages([]);
      setUrlLiveStage("");
    } else {
      setTemplatePiliers([]);
      setTemplatePillarsFound(0);
      setDocumentReorganizedByAi(false);
      setStrategicPreview(null);
      setCompanyName("");
      setSector("");
      setDescription("");
      setFaqHighlights([]);
    }

    setIsAnalyzing(true);
    setCurrentMessageIndex(0);
    setMessageVisible(true);

    try {
      let docResult: AnalyzeDocSuccess | null = null;
      let webResult: WebsiteScrapeResult | null = null;
      let docError: string | null = null;
      let webError: string | null = null;

      if (useFile) {
        setAnalysisKind("pdf");
        setLoadingMessages([...MAGIC_MESSAGES]);
        const formData = new FormData();
        formData.append("file", pdfFile!);
        const result = await analyzeDocument(formData);
        if (result.ok) {
          docResult = result;
        } else {
          docError = result.error;
        }
      }

      if (useUrl) {
        setAnalysisKind("url");
        setLoadingMessages([...URL_MAGIC_MESSAGES]);
        const streamResult = await runWebsiteAnalysisStream(urlTrim, {
          onStage: (msg) => setUrlLiveStage(msg),
          onPages: (pages) => setWebsitePages(pages),
        });
        if (streamResult.ok) {
          webResult = streamResult.data;
        } else {
          webError = streamResult.error;
        }
      }

      if (useFile && useUrl) {
        if (docResult && webResult) {
          const d = docResult.data;
          const w = webResult;
          if (d.template?.detected) {
            setCompanyName(d.companyName);
            setDescription(d.description);
            setSector(
              d.sector !== PROFILE_PLACEHOLDER ? d.sector : w.sector,
            );
            setFaqHighlights(mergeFaqHighlights(d.faqHighlights, w.faqHighlights));
            setTemplatePiliers(d.template.piliers);
            setTemplatePillarsFound(d.template.pillarsFound);
            setDocumentReorganizedByAi(false);
            setStrategicPreview(null);
          } else if (d.reorganized?.detected) {
            setCompanyName(d.companyName);
            setDescription(d.description);
            setSector(
              d.sector !== PROFILE_PLACEHOLDER ? d.sector : w.sector,
            );
            setFaqHighlights(mergeFaqHighlights(d.faqHighlights, w.faqHighlights));
            setTemplatePiliers(d.reorganized.piliers);
            setTemplatePillarsFound(4);
            setDocumentReorganizedByAi(true);
            setStrategicPreview(d.reorganized.categories);
          } else {
            setCompanyName(coalesceProfileField(d.companyName, w.companyName));
            setSector(coalesceProfileField(d.sector, w.sector));
            setDescription(coalesceProfileField(d.description, w.description));
            setFaqHighlights(mergeFaqHighlights(d.faqHighlights, w.faqHighlights));
            setTemplatePiliers([]);
            setTemplatePillarsFound(0);
            setDocumentReorganizedByAi(false);
            setStrategicPreview(null);
          }
          setWebsitePages(w.pagesAnalyzed);
          setWebsiteFacts(w.facts);
          setLastSource("both");
          setAnalysisComplete(true);
        } else if (docResult && !webResult) {
          const d = docResult.data;
          setCompanyName(d.companyName);
          setSector(d.sector);
          setDescription(d.description);
          setFaqHighlights(d.faqHighlights);
          if (d.template?.detected) {
            setTemplatePiliers(d.template.piliers);
            setTemplatePillarsFound(d.template.pillarsFound);
            setDocumentReorganizedByAi(false);
            setStrategicPreview(null);
          } else if (d.reorganized?.detected) {
            setTemplatePiliers(d.reorganized.piliers);
            setTemplatePillarsFound(4);
            setDocumentReorganizedByAi(true);
            setStrategicPreview(d.reorganized.categories);
          } else {
            setTemplatePiliers([]);
            setTemplatePillarsFound(0);
            setDocumentReorganizedByAi(false);
            setStrategicPreview(null);
          }
          setWebsiteFacts([]);
          setWebsitePages([]);
          setLastSource("pdf");
          setAnalysisComplete(true);
          if (webError) setAnalysisError(webError);
        } else if (!docResult && webResult) {
          const w = webResult;
          setCompanyName(w.companyName);
          setSector(w.sector);
          setDescription(w.description);
          setFaqHighlights(w.faqHighlights);
          setTemplatePiliers([]);
          setTemplatePillarsFound(0);
          setDocumentReorganizedByAi(false);
          setStrategicPreview(null);
          setWebsitePages(w.pagesAnalyzed);
          setWebsiteFacts(w.facts);
          setLastSource("url");
          setAnalysisComplete(true);
          if (docError) setAnalysisError(docError);
        } else {
          const parts = [docError, webError].filter(Boolean);
          setAnalysisError(parts.join(" — ") || "Analyse impossible.");
        }
      } else if (useFile && docResult) {
        const d = docResult.data;
        setCompanyName((prev) => coalesceProfileField(d.companyName, prev));
        setSector((prev) => coalesceProfileField(d.sector, prev));
        setDescription((prev) => coalesceProfileField(d.description, prev));
        setFaqHighlights((prev) => mergeFaqHighlights(d.faqHighlights, prev));
        if (d.template?.detected) {
          setTemplatePiliers(d.template.piliers);
          setTemplatePillarsFound(d.template.pillarsFound);
          setDocumentReorganizedByAi(false);
          setStrategicPreview(null);
        } else if (d.reorganized?.detected) {
          setTemplatePiliers(d.reorganized.piliers);
          setTemplatePillarsFound(4);
          setDocumentReorganizedByAi(true);
          setStrategicPreview(d.reorganized.categories);
        } else {
          setTemplatePiliers([]);
          setTemplatePillarsFound(0);
          setDocumentReorganizedByAi(false);
          setStrategicPreview(null);
        }
        setLastSource(hadWebsiteBefore ? "both" : "pdf");
        setAnalysisComplete(true);
      } else if (useFile && !docResult) {
        setAnalysisError(docError ?? "Échec de l’analyse du document.");
      } else if (useUrl && webResult) {
        const w = webResult;
        setCompanyName((prev) => coalesceProfileField(w.companyName, prev));
        setSector((prev) => coalesceProfileField(w.sector, prev));
        setDescription((prev) => coalesceProfileField(w.description, prev));
        setFaqHighlights((prev) => mergeFaqHighlights(w.faqHighlights, prev));
        setWebsitePages(w.pagesAnalyzed);
        setWebsiteFacts(w.facts);
        setLastSource(hadTemplateBefore ? "both" : "url");
        setAnalysisComplete(true);
      } else if (useUrl && !webResult) {
        setAnalysisError(webError ?? "Échec de l’analyse du site.");
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Une erreur est survenue lors de l’analyse.";
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
      setAnalysisKind(null);
    }
  }, [isAnalyzing, pdfFile, siteUrl, templatePillarsFound, templatePiliers.length, websiteFacts.length, websitePages.length]);

  const handleConfirmActivate = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveAgent({
        companyName,
        sector,
        description,
        faqHighlights,
        websiteUrl: siteUrl.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const templateWarnings: string[] = [];
      const websiteWarnings: string[] = [];

      if (templatePiliers.length > 0) {
        const knowledgeResult = await saveTemplateKnowledge(
          templatePiliers,
          documentReorganizedByAi ? "document_reorganized" : "template_upload",
        );
        if (!knowledgeResult.ok) {
          templateWarnings.push(knowledgeResult.error);
        }
      }

      if (websiteFacts.length > 0) {
        const knowledgeResult = await saveWebsiteKnowledge(websiteFacts);
        if (!knowledgeResult.ok) {
          websiteWarnings.push(knowledgeResult.error);
        }
      }

      const parts: string[] = ["Alura est activée."];
      if (templatePiliers.length > 0 && templateWarnings.length === 0) {
        parts.push(
          `${templatePiliers.length} Pilier${templatePiliers.length > 1 ? "s" : ""} du document indexé${templatePiliers.length > 1 ? "s" : ""}.`,
        );
      }
      if (websiteFacts.length > 0 && websiteWarnings.length === 0) {
        parts.push(
          `${websiteFacts.length} fait${websiteFacts.length > 1 ? "s" : ""} du site web indexé${websiteFacts.length > 1 ? "s" : ""}.`,
        );
      }
      if (templateWarnings.length > 0 || websiteWarnings.length > 0) {
        toast.warning(
          [
            "Agent enregistré ; indexation partielle.",
            ...templateWarnings,
            ...websiteWarnings,
          ].join(" "),
        );
      } else if (templatePiliers.length > 0 || websiteFacts.length > 0) {
        toast.success(parts.join(" "));
      } else {
        toast.success("Alura est maintenant activée !");
      }

      if (agentConfigured) {
        setSourcesWizardOpen(false);
        router.refresh();
        return;
      }

      router.push("/dashboard");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Une erreur est survenue lors de l’enregistrement.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    companyName,
    description,
    faqHighlights,
    isSaving,
    router,
    sector,
    siteUrl,
    agentConfigured,
    documentReorganizedByAi,
    templatePiliers,
    websiteFacts,
  ]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const isSupportedUploadFile = useCallback((f: File): boolean => {
    const name = f.name.toLowerCase();
    return (
      f.type === "application/pdf" ||
      name.endsWith(".pdf") ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    );
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      if (!isSupportedUploadFile(f)) {
        setAnalysisError("Veuillez déposer un fichier PDF ou DOCX.");
        return;
      }
      setPdfFile(f);
      setAnalysisError(null);
    },
    [isSupportedUploadFile],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) {
        setPdfFile(null);
        return;
      }
      if (!isSupportedUploadFile(f)) {
        setAnalysisError("Veuillez choisir un fichier PDF ou DOCX.");
        e.target.value = "";
        setPdfFile(null);
        return;
      }
      setPdfFile(f);
      setAnalysisError(null);
    },
    [isSupportedUploadFile],
  );

  const handleDownloadLeadsCsv = useCallback(async () => {
    setCsvExporting(true);
    try {
      const r = await exportLeadsCsv();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${r.count} lead${r.count > 1 ? "s" : ""} exporté(s).`);
    } finally {
      setCsvExporting(false);
    }
  }, []);

  const handleConfirmReset = useCallback(async () => {
    setResetSubmitting(true);
    try {
      const r = await resetAgentAction({ deleteLeads: deleteLeadsOnReset });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResetModalOpen(false);
      setDeleteLeadsOnReset(false);
      await router.refresh();
      router.push("/onboarding");
    } finally {
      setResetSubmitting(false);
    }
  }, [deleteLeadsOnReset, router]);

  if (agentConfigured && !sourcesWizardOpen) {
    return (
      <section className="w-full bg-background font-sans">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
          <header className="border-b border-zinc-200/70 pb-6 dark:border-zinc-800/80">
            <p className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Alura
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
              Sources & Identité
            </p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Gestion de votre agent
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Ajustez l’identité affichée sur le widget et enrichissez les sources
              indexées pour votre conseiller.
            </p>
          </header>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Identité
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Nom commercial, logo, couleurs du thème et message d’accueil du
                widget.
              </p>
              <Link
                href="/settings"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Modifier l’identité
              </Link>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Sources
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Réanalysez un site web ou importez un PDF / DOCX pour mettre à
                jour la base de connaissance.
              </p>
              <button
                type="button"
                onClick={() => setSourcesWizardOpen(true)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                Gérer les sources (site & documents)
              </button>
            </div>
          </div>

          <div
            className="rounded-2xl border border-red-200/80 bg-red-50/40 p-6 dark:border-red-900/50 dark:bg-red-950/20"
            aria-labelledby="danger-zone-heading"
          >
            <h2
              id="danger-zone-heading"
              className="text-lg font-semibold text-red-900 dark:text-red-200"
            >
              Zone de danger
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-red-900/85 dark:text-red-200/90">
              Réinitialise le profil, l’identité visuelle et toutes les entrées de
              la base de connaissance liées à cet agent. Cette action est
              irréversible.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeleteLeadsOnReset(false);
                setResetModalOpen(true);
              }}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-50 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-950"
            >
              Réinitialiser l’agent
            </button>
          </div>
        </div>

        {resetModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px]"
              aria-label="Fermer"
              onClick={() => !resetSubmitting && setResetModalOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-modal-title"
              className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            >
              <h2
                id="reset-modal-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Confirmer la réinitialisation
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Toutes les données de configuration et la connaissance indexée de
                cet agent seront effacées.
              </p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={deleteLeadsOnReset}
                  onChange={(e) => setDeleteLeadsOnReset(e.target.checked)}
                  disabled={resetSubmitting}
                  className="mt-1 h-4 w-4 rounded border-zinc-300"
                />
                <span>Supprimer également tous les leads</span>
              </label>
              {deleteLeadsOnReset ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleDownloadLeadsCsv()}
                    disabled={csvExporting || resetSubmitting}
                    className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-indigo-400"
                  >
                    {csvExporting
                      ? "Préparation du fichier…"
                      : "Télécharger le CSV des leads"}
                  </button>
                </div>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => !resetSubmitting && setResetModalOpen(false)}
                  disabled={resetSubmitting}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmReset()}
                  disabled={resetSubmitting}
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {resetSubmitting
                    ? "Réinitialisation…"
                    : "Réinitialiser définitivement"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="w-full bg-background font-sans">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {agentConfigured && sourcesWizardOpen ? (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setSourcesWizardOpen(false)}
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              ← Retour à la vue Sources & Identité
            </button>
          </div>
        ) : null}
        <header className="border-b border-zinc-200/70 pb-6 dark:border-zinc-800/80">
          <p className="text-xl font-semibold tracking-tight text-zinc-900">
            Alura
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
            Onboarding
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-zinc-200/80 bg-white/80 p-2 text-[11px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-center dark:bg-zinc-800">1. Sources</span>
            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-center dark:bg-zinc-800">2. Profil</span>
            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-center dark:bg-zinc-800">3. Activation</span>
          </div>
        </header>

        <div className="mt-8 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md sm:p-8 dark:border-white/10 dark:bg-white/5">
          <div className="text-center sm:text-left">
            <h1 className="text-balance text-2xl font-medium tracking-tight text-zinc-900 sm:text-[1.65rem]">
              Bienvenue, créons votre conseiller Alura
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:mx-0">
              Choisissez une source : nous extrairons l’essentiel pour donner à
              votre conseiller la voix de votre marque — précise et alignée sur
              vos contenus.
            </p>
          </div>

          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Ingestion hybride
            </p>

            {isAnalyzing && analysisKind === "pdf" ? (
              <div
                className="mt-4 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white px-6 py-12 transition-all duration-500 ease-out"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <MagicSpinner />
                <p
                  className={`mt-8 max-w-md text-center text-sm font-medium leading-relaxed text-zinc-700 transition-opacity duration-500 ease-out motion-reduce:transition-none ${
                    messageVisible ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {loadingMessages[currentMessageIndex] ?? ""}
                </p>
              </div>
            ) : analysisComplete ? (
              <div className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-emerald-100/80 bg-emerald-50/40 px-6 py-10 transition-all duration-500 ease-out">
                <p className="text-center text-lg" aria-hidden>
                  ✅
                </p>
                <p className="mt-3 text-center text-sm font-medium text-emerald-900">
                  Analyse terminée avec succès !
                </p>
                <p className="mt-1.5 max-w-sm text-center text-xs leading-relaxed text-emerald-800/80">
                  {lastSource === "both"
                    ? "Le profil ci-dessous combine votre document et votre site web."
                    : lastSource === "url"
                      ? "Le profil ci-dessous a été prérempli à partir de votre site web."
                      : "Le profil ci-dessous a été prérempli à partir de votre document."}
                </p>
                <div className="mt-4 flex w-full max-w-md flex-col items-center gap-2">
                  {templatePiliers.length > 0 ? (
                    <p className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-indigo-800">
                      <span aria-hidden>📄</span>
                      {templatePiliers.length} Pilier
                      {templatePiliers.length > 1 ? "s" : ""} extrait
                      {templatePiliers.length > 1 ? "s" : ""} du document
                    </p>
                  ) : null}
                  {websiteFacts.length > 0 ? (
                    <p className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-indigo-800">
                      <span aria-hidden>🌐</span>
                      {websiteFacts.length} fait
                      {websiteFacts.length > 1 ? "s" : ""} extrait
                      {websiteFacts.length > 1 ? "s" : ""} du site web
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 md:gap-5">
                  <div className="flex h-full flex-col">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Option A
                      </span>
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        Fichier PDF ou Word
                      </span>
                    </div>

                    <div className="mb-3 min-h-[104px] rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                      <p className="text-xs font-semibold text-indigo-900">
                        Nouveau : modèle FAQ Stratégique
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-indigo-900/80">
                        Remplissez notre modèle en 4 Piliers pour un onboarding
                        optimal (nom, mission, horaires, liens, offres, FAQ).
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a
                          href="/Template/Alura_Template_FAQ.docx"
                          download
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M12 3v12" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 21h14" />
                          </svg>
                          Télécharger le modèle Word
                        </a>
                        <a
                          href="https://docs.google.com/document/d/1RZumHmr-1FHH0hd3MYVQO2k7BQu-2X9zOL9KEXg1gNk/copy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M14 3h7v7" />
                            <path d="M21 3 10 14" />
                            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                          </svg>
                          Utiliser le modèle Google Docs
                        </a>
                      </div>
                    </div>

                    <input
                      id="onboarding-document"
                      type="file"
                      accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                      className="sr-only"
                      onChange={handleFileChange}
                      disabled={isAnalyzing}
                    />
                    <label
                      htmlFor="onboarding-document"
                      className={`block flex-1 ${isAnalyzing ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                    >
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={[
                          "flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 transition-colors",
                          isDragging
                            ? "border-zinc-400 bg-zinc-50/90 dark:border-zinc-500 dark:bg-zinc-800/60"
                            : "border-zinc-200/90 bg-zinc-50/30 hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-600 dark:bg-zinc-900/40 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/40",
                        ].join(" ")}
                      >
                        <DocumentIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                        <p className="mt-3 max-w-[220px] text-center text-sm font-medium leading-snug text-zinc-700 dark:text-zinc-200">
                          Glissez votre PDF ou DOCX ici
                        </p>
                        <p className="mt-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
                          ou cliquez pour parcourir
                        </p>
                        {pdfFile ? (
                          <p className="mt-3 max-w-full truncate px-2 text-center text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            {pdfFile.name}
                          </p>
                        ) : null}
                      </div>
                    </label>
                    <p className="mt-2.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Conseil : notre modèle FAQ Stratégique (Word ou Google Docs)
                      offre la configuration la plus précise et rapide.
                    </p>
                  </div>

                  <div className="relative flex h-full flex-col">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Option B
                      </span>
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        Site web
                      </span>
                    </div>
                    <motion.div
                      className="relative flex min-h-[210px] flex-1 flex-col overflow-hidden rounded-xl bg-zinc-50/30 px-4 py-5 dark:bg-zinc-900/35"
                      animate={
                        isAnalyzing && analysisKind === "url"
                          ? reduceMotion
                            ? {
                                borderColor: "rgba(82, 82, 91, 0.65)",
                                boxShadow: "0 0 0 2px rgba(63, 63, 70, 0.4)",
                              }
                            : {
                                borderColor: [
                                  "rgba(228, 228, 231, 0.95)",
                                  "rgba(82, 82, 91, 0.75)",
                                  "rgba(228, 228, 231, 0.95)",
                                ],
                                boxShadow: [
                                  "0 0 0 1px rgba(228, 228, 231, 0.8)",
                                  "0 0 0 2px rgba(63, 63, 70, 0.35)",
                                  "0 0 0 1px rgba(228, 228, 231, 0.8)",
                                ],
                              }
                          : {
                              borderColor: urlReady
                                ? "rgba(167, 243, 208, 0.85)"
                                : "rgba(228, 228, 231, 0.9)",
                              boxShadow: "0 0 0 1px rgba(228, 228, 231, 0.5)",
                            }
                      }
                      transition={
                        isAnalyzing && analysisKind === "url" && !reduceMotion
                          ? { duration: 1.85, repeat: Infinity, ease: "easeInOut" }
                          : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
                      }
                      style={{ borderWidth: 1, borderStyle: "solid" }}
                    >
                      <AnimatePresence mode="wait">
                        {urlReady && !isAnalyzing ? (
                          <motion.span
                            key="ready"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute right-3 top-3 rounded-full border border-emerald-200/90 bg-emerald-50/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 shadow-sm"
                          >
                            URL Prête
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                      <label htmlFor="site-url" className="sr-only">
                        URL du site web
                      </label>
                      <div className="flex items-start gap-2">
                        <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                        <div className="min-w-0 flex-1">
                          <input
                            id="site-url"
                            name="siteUrl"
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            placeholder="https://votre-site.com"
                            value={siteUrl}
                            onChange={(e) => setSiteUrl(e.target.value)}
                            readOnly={isAnalyzing}
                            aria-invalid={siteUrl.trim().length > 0 && !urlReady}
                            className="w-full border-0 border-b border-zinc-200/80 bg-transparent py-1.5 pr-24 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-0 dark:border-zinc-600 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                          />
                          <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                            Nous analyserons les pages publiques utiles à votre
                            activité (présentation, offre, contact).
                          </p>
                        </div>
                      </div>
                    </motion.div>
                    <p className="mt-2.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Conseil : privilégiez l’URL de votre page d’accueil ou de
                      votre offre principale.
                    </p>
                  </div>
                </div>

                {isAnalyzing && analysisKind === "url" ? (
                  <div
                    className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white px-6 py-10"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <MagicSpinner />
                    <p className="mt-6 max-w-md text-center text-sm font-medium leading-relaxed text-zinc-800">
                      {urlLiveStage || loadingMessages[currentMessageIndex] || "Analyse en cours…"}
                    </p>
                    {websitePages.length > 0 ? (
                      <ul className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                        {websitePages.map((p) => {
                          const active =
                            urlLiveStage.toLowerCase().includes(p.label.toLowerCase()) ||
                            (p.label === "Page d'accueil" &&
                              urlLiveStage.toLowerCase().includes("accueil"));
                          return (
                            <li
                              key={p.url}
                              className={[
                                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                active
                                  ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/50 dark:bg-indigo-950/50 dark:text-indigo-200"
                                  : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
                              ].join(" ")}
                            >
                              {p.label}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!analysisComplete ? (
              <motion.div
                key="analyze-cta"
                initial={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8"
              >
                <button
                  type="button"
                  onClick={() => void startMagicAnalysis()}
                  disabled={isAnalyzing || isSaving}
                  className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-medium tracking-wide text-white transition-all hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAnalyzing ? "Analyse en cours…" : "Analyser les données"}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {analysisError ? (
            <p
              className="mt-6 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {analysisError}
            </p>
          ) : null}

          <form
            className="mt-10 space-y-5 border-t border-zinc-100 pt-10 pb-8 dark:border-zinc-800 sm:pb-10"
            onSubmit={(e) => e.preventDefault()}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Profil entreprise
            </p>
            <div>
              <label
                htmlFor="company-name"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-300"
              >
                Nom de l&apos;entreprise
              </label>
              <input
                id="company-name"
                name="companyName"
                type="text"
                readOnly
                placeholder="Complété automatiquement après analyse"
                aria-readonly="true"
                value={companyName}
                className="mt-1.5 w-full rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-700/40"
              />
            </div>
            <div>
              <label
                htmlFor="sector"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-300"
              >
                Secteur d&apos;activité
              </label>
              <input
                id="sector"
                name="sector"
                type="text"
                readOnly
                placeholder="Complété automatiquement après analyse"
                aria-readonly="true"
                value={sector}
                className="mt-1.5 w-full rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-700/40"
              />
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-300"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                readOnly
                rows={4}
                placeholder="Complété automatiquement après analyse"
                aria-readonly="true"
                value={description}
                className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-700/40"
              />
            </div>

            <div
              className={`rounded-xl border border-dashed px-4 py-8 transition-colors duration-500 sm:px-6 ${
                analysisComplete
                  ? "border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/25"
                  : "border-zinc-200/90 bg-zinc-50/40 dark:border-zinc-600 dark:bg-zinc-900/40"
              }`}
            >
              <h2 className="text-center text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-left">
                Intelligence Extraite
              </h2>
              {analysisComplete ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                  className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  {documentReorganizedByAi && strategicPreview ? (
                    <>
                      <p className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs leading-relaxed text-violet-900">
                        <span aria-hidden>✨</span> J&apos;ai réorganisé votre
                        document pour l&apos;adapter à ma structure stratégique.
                        Veuillez vérifier les informations ci-dessous.
                      </p>
                      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 sm:text-left">
                        Prévisualisation
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-zinc-200/90 bg-white p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            1 — Identité (Nom, Mission)
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                            {strategicPreview.identite}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200/90 bg-white p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            2 — Pratique (Accès, Horaires)
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                            {strategicPreview.pratique}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200/90 bg-white p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            3 — Catalogue (Offres, Prix, Procédures)
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                            {strategicPreview.catalogue}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200/90 bg-white p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            4 — Réclamations (Désabonnement, Escalade)
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                            {strategicPreview.reclamations}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Chaque bloc sera indexé avec un embedding dédié dans votre
                        base de connaissance à la validation.
                      </p>
                    </>
                  ) : templatePillarsFound > 0 ? (
                    <>
                      <p className="font-medium text-indigo-900">
                        {templatePiliers.length} Pilier
                        {templatePiliers.length > 1 ? "s" : ""} extrait
                        {templatePiliers.length > 1 ? "s" : ""} du document
                      </p>
                      <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
                        {templatePiliers.map((p) => (
                          <li
                            key={`pilier-${p.index}`}
                            className="flex items-start gap-2"
                          >
                            <span
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700"
                              aria-hidden
                            >
                              {p.index}
                            </span>
                            <span>
                              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                                Pilier {p.index}
                              </span>
                              {p.title ? ` — ${p.title}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Chaque bloc sera indexé avec un embedding dédié dans votre
                        base de connaissance à la validation.
                      </p>
                    </>
                  ) : null}
                  {websitePages.length > 0 || websiteFacts.length > 0 ? (
                    <>
                      <p className="font-medium text-indigo-900">
                        {websiteFacts.length} fait
                        {websiteFacts.length > 1 ? "s" : ""} extrait
                        {websiteFacts.length > 1 ? "s" : ""} du site web
                        {websitePages.length > 0
                          ? ` (${websitePages.length} page${websitePages.length > 1 ? "s" : ""} analysée${websitePages.length > 1 ? "s" : ""})`
                          : ""}
                      </p>
                      {websitePages.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {websitePages.map((p) => (
                            <li
                              key={p.url}
                              className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-800"
                            >
                              {p.label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {websiteFacts.length > 0 ? (
                        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-zinc-600 dark:text-zinc-300">
                          {websiteFacts.slice(0, 8).map((f, idx) => (
                            <li
                              key={`fact-${idx}-${f.topic.slice(0, 16)}`}
                              className="flex items-start gap-2"
                            >
                              <span
                                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400"
                                aria-hidden
                              />
                              <span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                                  {f.topic}
                                </span>
                                <span className="text-zinc-600 dark:text-zinc-400">
                                  {" "}
                                  — {f.content}
                                </span>
                              </span>
                            </li>
                          ))}
                          {websiteFacts.length > 8 ? (
                            <li className="pl-3.5 text-[11px] italic text-zinc-600 dark:text-zinc-400">
                              +{websiteFacts.length - 8} autres blocs indexés à la
                              validation…
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Chaque bloc sera indexé avec un embedding dédié dans votre
                        base de connaissance à la validation.
                      </p>
                    </>
                  ) : null}
                  {templatePillarsFound === 0 &&
                  !documentReorganizedByAi &&
                  websitePages.length === 0 &&
                  websiteFacts.length === 0 ? (
                    <>
                      <p className="text-emerald-900/90 dark:text-emerald-200/90">
                        Points clés issus de votre FAQ (aperçu) :
                      </p>
                      <ul className="list-inside list-disc space-y-1.5 text-zinc-600 dark:text-zinc-300">
                        {faqHighlights
                          .filter((line) => line.length > 0)
                          .map((line, idx) => (
                            <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                          ))}
                      </ul>
                      {faqHighlights.every((l) => !l.length) ? (
                        <p className="text-zinc-600 dark:text-zinc-400">
                          Aucun point FAQ distinct n’a été isolé ; le profil repose
                          sur le nom, le secteur et la description ci-dessus.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </motion.div>
              ) : (
                <p className="mt-2 text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-left">
                  Les points clés de votre entreprise apparaîtront ici après
                  analyse.
                </p>
              )}
            </div>

            <AnimatePresence mode="wait">
              {analysisComplete ? (
                <motion.div
                  key="confirm-cta"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="pb-2 pt-2 sm:pb-4"
                >
                  <button
                    type="button"
                    onClick={() => void handleConfirmActivate()}
                    disabled={isSaving}
                    aria-busy={isSaving}
                    className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_8px_30px_rgb(0,0,0,0.18)] transition-all hover:bg-zinc-900 hover:shadow-[0_12px_36px_rgb(0,0,0,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 enabled:active:scale-[0.99] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSaving ? (
                      <>
                        <SaveSpinner />
                        <span>Création de votre agent…</span>
                      </>
                    ) : (
                      "Confirmer et Activer Alura"
                    )}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </form>
        </div>
      </div>
    </section>
  );
}
