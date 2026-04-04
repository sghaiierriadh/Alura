"use client";

import { useCallback, useState } from "react";

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

export default function OnboardingPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

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
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-5">
              <div className="flex flex-col">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Option A
                  </span>
                  <span className="text-sm font-medium text-zinc-800">
                    Fichier
                  </span>
                </div>
                <input
                  id="onboarding-document"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="sr-only"
                />
                <label
                  htmlFor="onboarding-document"
                  className="block flex-1 cursor-pointer"
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
                      Glissez votre document ici
                    </p>
                    <p className="mt-1.5 text-center text-xs text-zinc-400">
                      PDF, Word ou texte — ou cliquez pour parcourir
                    </p>
                  </div>
                </label>
                <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                  Conseil : un PDF de vos tarifs ou de votre FAQ est idéal pour
                  une configuration rapide et fiable.
                </p>
              </div>

              <div className="flex flex-col">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Option B
                  </span>
                  <span className="text-sm font-medium text-zinc-800">
                    Site web
                  </span>
                </div>
                <div className="flex min-h-[168px] flex-col rounded-xl border border-zinc-200/90 bg-zinc-50/30 px-4 py-5">
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
                        className="w-full border-0 border-b border-zinc-200/80 bg-transparent py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
                      />
                      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                        Nous analyserons les pages publiques utiles à votre
                        activité (présentation, offre, contact).
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                  Conseil : privilégiez l’URL de votre page d’accueil ou de votre
                  offre principale.
                </p>
              </div>
            </div>
          </div>

          <form
            className="mt-10 space-y-5 border-t border-zinc-100 pt-10"
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
                className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-600 placeholder:text-zinc-400/90 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-200/60"
              />
            </div>

            <div className="rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-4 py-8 sm:px-6">
              <h2 className="text-center text-sm font-semibold tracking-tight text-zinc-800 sm:text-left">
                Intelligence Extraite
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-zinc-400 sm:text-left">
                Les points clés de votre entreprise apparaîtront ici après
                analyse.
              </p>
            </div>

            <button
              type="button"
              className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Confirmer et Activer Alura
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
