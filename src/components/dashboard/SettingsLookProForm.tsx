"use client";

import { updateAgentBranding } from "@/app/actions/update-agent-branding";
import { Camera, Check, Copy, MessageCircle, MessagesSquare } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  agentId: string;
  appUrl: string;
  initialChatbotName: string;
  initialThemeColor: string;
  initialTextColor: string;
  initialWelcomeMessage: string;
  initialAvatarUrl: string | null;
};

function normalizeHexColor(raw: string): string {
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return "#18181b";
}

export function SettingsLookProForm({
  agentId,
  appUrl,
  initialChatbotName,
  initialThemeColor,
  initialTextColor,
  initialWelcomeMessage,
  initialAvatarUrl,
}: Props) {
  const [chatbotName, setChatbotName] = useState(initialChatbotName);
  const [themeColor, setThemeColor] = useState(normalizeHexColor(initialThemeColor));
  const [textColor, setTextColor] = useState(normalizeHexColor(initialTextColor));
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcomeMessage);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const avatarPreview = useMemo(() => {
    if (avatarFile) return URL.createObjectURL(avatarFile);
    return avatarUrl;
  }, [avatarFile, avatarUrl]);

  const integrationScript = `<script src='${appUrl}/widget.js' data-agent-id='${agentId}' async></script>`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(integrationScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Impossible de copier le code.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Identité du chatbot
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Personnalisez la marque visuelle et le ton d’accueil.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("chatbot_name", chatbotName);
            fd.set("theme_color", themeColor);
            fd.set("text_color", textColor);
            fd.set("welcome_message", welcomeMessage);
            if (avatarUrl) fd.set("previous_avatar_url", avatarUrl);
            if (avatarFile) fd.set("avatar", avatarFile);
            startTransition(async () => {
              const res = await updateAgentBranding(fd);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setThemeColor(res.data.themeColor);
              setTextColor(res.data.textColor);
              setAvatarUrl(res.data.avatarUrl);
              setAvatarFile(null);
              toast.success("Branding mis à jour.");
            });
          }}
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Nom du chatbot
              </span>
              <input
                value={chatbotName}
                onChange={(e) => setChatbotName(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/30 px-3 py-2.5 text-sm text-zinc-900 backdrop-blur-md outline-none ring-0 placeholder:text-zinc-500 focus:border-zinc-400 dark:bg-zinc-900/40 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                placeholder="Alura Pro"
                required
              />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Couleur principale
              </span>
              <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/30 px-3 py-2 dark:bg-zinc-900/40">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(normalizeHexColor(e.target.value))}
                  className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  value={themeColor}
                  onChange={(e) => setThemeColor(normalizeHexColor(e.target.value))}
                  className="w-full bg-transparent text-sm text-zinc-800 outline-none dark:text-zinc-100"
                  placeholder="#18181b"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Couleur du texte
              </span>
              <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/30 px-3 py-2 dark:bg-zinc-900/40">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(normalizeHexColor(e.target.value))}
                  className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  value={textColor}
                  onChange={(e) => setTextColor(normalizeHexColor(e.target.value))}
                  className="w-full bg-transparent text-sm text-zinc-800 outline-none dark:text-zinc-100"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Message de bienvenue
            </span>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              required
              className="w-full rounded-xl border border-white/20 bg-white/30 px-3 py-2.5 text-sm text-zinc-900 backdrop-blur-md outline-none placeholder:text-zinc-500 focus:border-zinc-400 dark:bg-zinc-900/40 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              placeholder="Bonjour, je suis votre assistante..."
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Avatar
            </span>
            <div className="flex items-center gap-4 rounded-xl border border-white/20 bg-white/30 p-3 dark:bg-zinc-900/40">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-zinc-900/10">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="Aperçu avatar" className="h-full w-full rounded-full object-cover object-center" />
                ) : (
                  <span className="text-xs text-zinc-500">Aucun</span>
                )}
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-white"
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Résolution recommandée : <strong>512x512 px</strong> (PNG/WEBP), logo centré, fond transparent.
            </p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ backgroundColor: themeColor }}
          >
            {pending ? "Enregistrement..." : "Enregistrer l'identité"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Déploiement</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Copiez-collez ce script sur votre site pour intégrer le widget.
            </p>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-white/25 bg-white/20 text-zinc-800 hover:bg-white/30 dark:text-zinc-100"
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copié !" : "Copier le code"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-white/20 bg-zinc-950/90 p-4 text-xs leading-relaxed text-emerald-300">
          <code>{integrationScript}</code>
        </pre>
      </section>

      <section className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Canaux de diffusion</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Connecteurs sociaux en préparation pour étendre la présence d&apos;Alura.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { name: "WhatsApp", icon: MessageCircle },
            { name: "Messenger", icon: MessagesSquare },
              { name: "Instagram", icon: Camera },
          ].map((item) => (
            <div
              key={item.name}
              className="relative rounded-2xl border border-white/20 bg-white/25 p-4 dark:bg-zinc-900/40"
            >
              <span className="absolute right-3 top-3 rounded-full border border-amber-300/40 bg-amber-200/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Coming Soon
              </span>
              <item.icon className="h-6 w-6 text-zinc-800 dark:text-zinc-100" />
              <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.name}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
