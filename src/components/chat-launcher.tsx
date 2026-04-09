"use client";

import { MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";

type Props = {
  agentId: string;
  /** URL de base du site Alura (ex. https://app.alura.tn). Par défaut : origine courante. */
  baseUrl?: string;
  className?: string;
};

export function ChatLauncher({ agentId, baseUrl, className }: Props) {
  const [open, setOpen] = useState(false);
  /** Garde l’iframe montée après le 1er ouverture (état de discussion conservé). */
  const [iframePersist, setIframePersist] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  const trimmed = agentId.trim();
  const origin =
    (baseUrl?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "")) ||
    "";
  const widgetSrc =
    trimmed && origin
      ? `${origin}/widget?agentId=${encodeURIComponent(trimmed)}`
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIframePersist(true);
          setOpen(true);
        }}
        disabled={!trimmed}
        className={
          className ??
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-zinc-100 shadow-lg ring-1 ring-zinc-700/80 transition hover:bg-zinc-800 hover:ring-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-40"
        }
        aria-label="Ouvrir le chat Alura"
      >
        <MessageCircle className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </button>

      <div
        className={`fixed inset-0 z-50 flex flex-col md:flex-row md:items-end md:justify-end md:p-6 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out md:bg-black/40 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={close}
          aria-label="Fermer le chat"
          tabIndex={open ? 0 : -1}
        />

        <div
          className={`relative z-10 flex min-h-0 w-full flex-col bg-zinc-950 shadow-2xl transition-all duration-300 ease-out max-md:h-dvh max-md:max-h-dvh md:h-[600px] md:w-[400px] md:max-h-[min(600px,calc(100vh-3rem))] md:rounded-2xl md:ring-1 md:ring-zinc-800 ${open ? "translate-y-0 scale-100 opacity-100" : "translate-y-8 scale-95 opacity-0 max-md:translate-y-full"}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 px-3 py-2.5 md:rounded-t-2xl md:px-4">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Alura
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-50"
            >
              Fermer
            </button>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {iframePersist && widgetSrc ? (
              <iframe
                title="Alura — chat"
                src={widgetSrc}
                className={`block h-full min-h-0 w-full min-w-0 origin-bottom border-0 transition-all duration-300 ease-out ${
                  open
                    ? "pointer-events-auto scale-100 opacity-100"
                    : "pointer-events-none scale-95 opacity-0"
                }`}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
