"use client";

import { analyzeDocument } from "@/app/actions/analyze-doc";
import { saveAgent } from "@/app/actions/save-agent";
import { saveTemplateKnowledge } from "@/app/actions/save-template-knowledge";
import { saveWebsiteKnowledge } from "@/app/actions/save-website-knowledge";
import type { PillarBlock } from "@/lib/knowledge/parse-pillars";
import type {
  CuratedFact,
  DetectedPage,
  ScrapeProgress,
  WebsiteScrapeResult,
} from "@/lib/ingestion/website-scraper";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

export default function OnboardingPage() {
  const router = useRouter();
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
  const [lastSource, setLastSource] = useState<"pdf" | "url" | null>(null);
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

    if (!useUrl && !pdfFile) {
      setAnalysisError("Veuillez renseigner une URL ou sélectionner un fichier PDF.");
      return;
    }

    setAnalysisError(null);
    setAnalysisComplete(false);
    setCompanyName("");
    setSector("");
    setDescription("");
    setFaqHighlights([]);
    setTemplatePiliers([]);
    setTemplatePillarsFound(0);
    setWebsiteFacts([]);
    setWebsitePages([]);
    setUrlLiveStage("");
    setLastSource(null);
    setIsAnalyzing(true);
    setAnalysisKind(useUrl ? "url" : "pdf");
    setCurrentMessageIndex(0);
    setMessageVisible(true);
    setLoadingMessages(
      useUrl ? [...URL_MAGIC_MESSAGES] : [...MAGIC_MESSAGES],
    );

    try {
      if (useUrl) {
        const streamResult = await runWebsiteAnalysisStream(urlTrim, {
          onStage: (msg) => setUrlLiveStage(msg),
          onPages: (pages) => setWebsitePages(pages),
        });
        if (streamResult.ok) {
          setCompanyName(streamResult.data.companyName);
          setSector(streamResult.data.sector);
          setDescription(streamResult.data.description);
          setFaqHighlights(streamResult.data.faqHighlights);
          setWebsitePages(streamResult.data.pagesAnalyzed);
          setWebsiteFacts(streamResult.data.facts);
          setAnalysisComplete(true);
          setLastSource("url");
        } else {
          setAnalysisError(streamResult.error);
        }
      } else {
        const formData = new FormData();
        formData.append("file", pdfFile!);
        const result = await analyzeDocument(formData);
        if (result.ok) {
          setCompanyName(result.data.companyName);
          setSector(result.data.sector);
          setDescription(result.data.description);
          setFaqHighlights(result.data.faqHighlights);
          if (result.data.template?.detected) {
            setTemplatePiliers(result.data.template.piliers);
            setTemplatePillarsFound(result.data.template.pillarsFound);
          } else {
            setTemplatePiliers([]);
            setTemplatePillarsFound(0);
          }
          setAnalysisComplete(true);
          setLastSource("pdf");
        } else {
          setAnalysisError(result.error);
        }
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Une erreur est survenue lors de l’analyse.";
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
      setAnalysisKind(null);
    }
  }, [isAnalyzing, pdfFile, siteUrl]);

  const handleConfirmActivate = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveAgent({
        companyName,
        sector,
        description,
        faqHighlights,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (templatePiliers.length > 0) {
        const knowledgeResult = await saveTemplateKnowledge(templatePiliers);
        if (knowledgeResult.ok) {
          toast.success(
            `Alura activée ! ${knowledgeResult.inserted} bloc${
              knowledgeResult.inserted > 1 ? "s" : ""
            } de connaissance indexé${knowledgeResult.inserted > 1 ? "s" : ""}.`,
          );
        } else {
          toast.warning(
            `Agent enregistré, mais indexation partielle : ${knowledgeResult.error}`,
          );
        }
      } else if (websiteFacts.length > 0) {
        const knowledgeResult = await saveWebsiteKnowledge(websiteFacts);
        if (knowledgeResult.ok) {
          toast.success(
            `Alura activée ! ${knowledgeResult.inserted} bloc${
              knowledgeResult.inserted > 1 ? "s" : ""
            } de connaissance indexé${knowledgeResult.inserted > 1 ? "s" : ""} depuis le site.`,
          );
        } else {
          toast.warning(
            `Agent enregistré, mais indexation partielle : ${knowledgeResult.error}`,
          );
        }
      } else {
        toast.success("Alura est maintenant activée !");
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

  return (
    <section className="w-full bg-zinc-50 font-sans">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="border-b border-zinc-200/70 pb-6">
          <p className="text-xl font-semibold tracking-tight text-zinc-900">
            Alura
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Onboarding
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="text-center sm:text-left">
            <h1 className="text-balance text-2xl font-medium tracking-tight text-zinc-900 sm:text-[1.65rem]">
              Bienvenue, créons votre conseiller Alura
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-500 sm:mx-0">
              Choisissez une source : nous extrairons l’essentiel pour donner à
              votre conseiller la voix de votre marque — précise et alignée sur
              vos contenus.
            </p>
          </div>

          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
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
                  {lastSource === "url"
                    ? "Le profil ci-dessous a été prérempli à partir de votre site web."
                    : "Le profil ci-dessous a été prérempli à partir de votre document."}
                </p>
                {templatePillarsFound > 0 ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold text-indigo-800">
                    <span aria-hidden>🧭</span>
                    Structure détectée : {templatePillarsFound} Pilier
                    {templatePillarsFound > 1 ? "s" : ""} identifié
                    {templatePillarsFound > 1 ? "s" : ""}
                  </p>
                ) : null}
                {lastSource === "url" && websitePages.length > 0 ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold text-indigo-800">
                    <span aria-hidden>🌐</span>
                    {websitePages.length} page{websitePages.length > 1 ? "s" : ""} analysée
                    {websitePages.length > 1 ? "s" : ""}, {websiteFacts.length} bloc
                    {websiteFacts.length > 1 ? "s" : ""} de connaissance extrait
                    {websiteFacts.length > 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-5">
                  <div className="flex flex-col">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Option A
                      </span>
                      <span className="text-sm font-medium text-zinc-800">
                        Fichier PDF ou Word
                      </span>
                    </div>

                    <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
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
                      disabled={isAnalyzing && analysisKind === "url"}
                    />
                    <label
                      htmlFor="onboarding-document"
                      className={`block flex-1 ${isAnalyzing && analysisKind === "url" ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                    >
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={[
                          "flex min-h-[168px] flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 transition-colors",
                          isDragging
                            ? "border-zinc-400 bg-zinc-50/90"
                            : "border-zinc-200/90 bg-zinc-50/30 hover:border-zinc-300 hover:bg-zinc-50/50",
                        ].join(" ")}
                      >
                        <DocumentIcon className="h-10 w-10 text-zinc-400" />
                        <p className="mt-3 max-w-[220px] text-center text-sm font-medium leading-snug text-zinc-700">
                          Glissez votre PDF ou DOCX ici
                        </p>
                        <p className="mt-1.5 text-center text-xs text-zinc-400">
                          ou cliquez pour parcourir
                        </p>
                        {pdfFile ? (
                          <p className="mt-3 max-w-full truncate px-2 text-center text-xs font-medium text-zinc-600">
                            {pdfFile.name}
                          </p>
                        ) : null}
                      </div>
                    </label>
                    <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                      Conseil : notre modèle FAQ Stratégique (Word ou Google Docs)
                      offre la configuration la plus précise et rapide.
                    </p>
                  </div>

                  <div className="relative flex flex-col">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Option B
                      </span>
                      <span className="text-sm font-medium text-zinc-800">
                        Site web
                      </span>
                    </div>
                    <motion.div
                      className="relative flex min-h-[168px] flex-col overflow-hidden rounded-xl bg-zinc-50/30 px-4 py-5"
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
                        <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
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
                            readOnly={isAnalyzing && analysisKind === "url"}
                            aria-invalid={siteUrl.trim().length > 0 && !urlReady}
                            className="w-full border-0 border-b border-zinc-200/80 bg-transparent py-1.5 pr-24 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
                          />
                          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                            Nous analyserons les pages publiques utiles à votre
                            activité (présentation, offre, contact).
                          </p>
                        </div>
                      </div>
                    </motion.div>
                    <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
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
                                  ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                                  : "border-zinc-200 bg-white text-zinc-500",
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
            className="mt-10 space-y-5 border-t border-zinc-100 pt-10 pb-8 sm:pb-10"
            onSubmit={(e) => e.preventDefault()}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Profil entreprise
            </p>
            <div>
              <label
                htmlFor="company-name"
                className="block text-sm font-medium text-zinc-600"
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
                className="mt-1.5 w-full rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-400/90 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60"
              />
            </div>
            <div>
              <label
                htmlFor="sector"
                className="block text-sm font-medium text-zinc-600"
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
                className="mt-1.5 w-full rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-400/90 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60"
              />
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-600"
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
                className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-400/90 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60"
              />
            </div>

            <div
              className={`rounded-xl border border-dashed px-4 py-8 transition-colors duration-500 sm:px-6 ${
                analysisComplete
                  ? "border-emerald-200/80 bg-emerald-50/30"
                  : "border-zinc-200/90 bg-zinc-50/40"
              }`}
            >
              <h2 className="text-center text-sm font-semibold tracking-tight text-zinc-800 sm:text-left">
                Intelligence Extraite
              </h2>
              {analysisComplete ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                  className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-700"
                >
                  {templatePillarsFound > 0 ? (
                    <>
                      <p className="font-medium text-indigo-900">
                        Structure détectée : {templatePillarsFound} Pilier
                        {templatePillarsFound > 1 ? "s" : ""} identifié
                        {templatePillarsFound > 1 ? "s" : ""}
                      </p>
                      <ul className="space-y-1.5 text-zinc-600">
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
                              <span className="font-medium text-zinc-800">
                                Pilier {p.index}
                              </span>
                              {p.title ? ` — ${p.title}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-zinc-500">
                        Chaque bloc sera indexé avec un embedding dédié dans votre
                        base de connaissance à la validation.
                      </p>
                    </>
                  ) : lastSource === "url" && websitePages.length > 0 ? (
                    <>
                      <p className="font-medium text-indigo-900">
                        {websitePages.length} page{websitePages.length > 1 ? "s" : ""} analysée
                        {websitePages.length > 1 ? "s" : ""}, {websiteFacts.length} bloc
                        {websiteFacts.length > 1 ? "s" : ""} de connaissance extrait
                        {websiteFacts.length > 1 ? "s" : ""}
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
                        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-zinc-600">
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
                                <span className="font-medium text-zinc-800">
                                  {f.topic}
                                </span>
                                <span className="text-zinc-500"> — {f.content}</span>
                              </span>
                            </li>
                          ))}
                          {websiteFacts.length > 8 ? (
                            <li className="pl-3.5 text-[11px] italic text-zinc-400">
                              +{websiteFacts.length - 8} autres blocs indexés à la
                              validation…
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                      <p className="text-xs text-zinc-500">
                        Chaque bloc sera indexé avec un embedding dédié dans votre
                        base de connaissance à la validation.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-emerald-900/90">
                        Points clés issus de votre FAQ (aperçu) :
                      </p>
                      <ul className="list-inside list-disc space-y-1.5 text-zinc-600">
                        {faqHighlights
                          .filter((line) => line.length > 0)
                          .map((line, idx) => (
                            <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                          ))}
                      </ul>
                      {faqHighlights.every((l) => !l.length) ? (
                        <p className="text-zinc-500">
                          Aucun point FAQ distinct n’a été isolé ; le profil repose
                          sur le nom, le secteur et la description ci-dessus.
                        </p>
                      ) : null}
                    </>
                  )}
                </motion.div>
              ) : (
                <p className="mt-2 text-center text-sm leading-relaxed text-zinc-400 sm:text-left">
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
