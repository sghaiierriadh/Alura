"use client";

import { saveAgentApiExpertSettings } from "@/app/actions/save-agent-api-expert";
import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Props = {
  initialEndpoint: string;
  /** Indique qu’une clé est déjà enregistrée (la valeur n’est jamais exposée au client). */
  apiKeyConfigured: boolean;
};

export function AgentApiExpertForm({ initialEndpoint, apiKeyConfigured }: Props) {
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const res = await saveAgentApiExpertSettings({
          apiEndpoint: endpoint,
          apiKey,
          clearApiKey: clearKey,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Paramètres API enregistrés.");
        setApiKey("");
        setClearKey(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur d’enregistrement.");
      } finally {
        setSaving(false);
      }
    },
    [apiKey, clearKey, endpoint, saving],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        API Expert
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Alura enverra une requête POST JSON <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">{`{ "query": "…" }`}</code> vers votre URL. Une clé optionnelle est envoyée en{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">X-Api-Key</code>.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="api-endpoint"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Endpoint API
          </label>
          <input
            id="api-endpoint"
            type="url"
            name="apiEndpoint"
            autoComplete="off"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.exemple.com/alura/query"
            className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="api-key"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Clé API
          </label>
          <input
            id="api-key"
            type="password"
            name="apiKey"
            autoComplete="new-password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              apiKeyConfigured
                ? "Laisser vide pour conserver la clé actuelle"
                : "Optionnel"
            }
            className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100"
          />
          {apiKeyConfigured ? (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
              />
              Supprimer la clé enregistrée
            </label>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
