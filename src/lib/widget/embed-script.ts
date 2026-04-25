import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type WidgetBranding = {
  themeColor: string;
  avatarUrl: string | null;
};

function normalizeHexColor(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#18181b";
}

export function resolveWidgetOrigin(req: Request): string {
  const reqUrl = new URL(req.url);
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim() || "";
  const isLocalHostReq =
    reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
  if (isLocalHostReq) return "http://localhost:3000";
  return envOrigin || reqUrl.origin;
}

export async function fetchWidgetBranding(
  agentId: string,
): Promise<WidgetBranding | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  const trimmedId = agentId.trim();
  if (!trimmedId) return null;

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
  const { data, error } = await admin.from("agents").select("*").eq("id", trimmedId).maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    themeColor: normalizeHexColor(
      typeof row.theme_color === "string" ? row.theme_color : null,
    ),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}

export function buildWidgetLauncherScript(origin: string): string {
  return `(function () {
  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.getElementsByTagName('script');
    currentScript = scripts[scripts.length - 1];
  }
  if (!currentScript) return;
  var agentId = currentScript.getAttribute('data-agent-id');
  if (!agentId) {
    console.warn('[Alura widget] data-agent-id manquant.');
    return;
  }
  if (window.__ALURA_WIDGET_INITIALIZED__) return;
  window.__ALURA_WIDGET_INITIALIZED__ = true;

  var defaultColor = '#18181b';
  var launcherSize = 56;
  var host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.right = '20px';
  host.style.bottom = '20px';
  host.style.zIndex = '9999';
  host.style.fontFamily = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  host.style.pointerEvents = 'none';

  var panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.right = '0';
  panel.style.bottom = (launcherSize + 12) + 'px';
  panel.style.width = '400px';
  panel.style.height = '600px';
  panel.style.maxWidth = 'calc(100vw - 24px)';
  panel.style.maxHeight = 'calc(100vh - 96px)';
  panel.style.borderRadius = '16px';
  panel.style.overflow = 'hidden';
  panel.style.background = '#0a0a0a';
  panel.style.boxShadow = '0 30px 80px rgba(0,0,0,0.45)';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(18px) scale(0.98)';
  panel.style.transition = 'opacity 180ms ease, transform 180ms ease';
  panel.style.pointerEvents = 'none';

  var iframe = document.createElement('iframe');
  iframe.src = '${origin}/widget?id=' + encodeURIComponent(agentId);
  iframe.title = 'Alura Widget';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('loading', 'lazy');
  panel.appendChild(iframe);

  var launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Ouvrir le chat Alura');
  launcher.style.width = launcherSize + 'px';
  launcher.style.height = launcherSize + 'px';
  launcher.style.borderRadius = '9999px';
  launcher.style.border = '0';
  launcher.style.cursor = 'pointer';
  launcher.style.background = defaultColor;
  launcher.style.color = '#fff';
  launcher.style.display = 'flex';
  launcher.style.alignItems = 'center';
  launcher.style.justifyContent = 'center';
  launcher.style.pointerEvents = 'auto';
  launcher.style.boxShadow = '0 18px 45px rgba(0,0,0,0.4)';
  launcher.style.transition = 'transform 160ms ease, opacity 160ms ease';
  launcher.onmouseenter = function () { launcher.style.transform = 'translateY(-1px)'; };
  launcher.onmouseleave = function () { launcher.style.transform = 'translateY(0)'; };
  launcher.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 10h8M8 14h5M21 12c0 4.97-4.48 9-10 9-1.2 0-2.35-.19-3.4-.55L3 22l1.5-3.58A8.84 8.84 0 0 1 1 12c0-4.97 4.48-9 10-9s10 4.03 10 9Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var pulse = document.createElement('span');
  pulse.style.position = 'absolute';
  pulse.style.right = '0';
  pulse.style.bottom = '0';
  pulse.style.width = launcherSize + 'px';
  pulse.style.height = launcherSize + 'px';
  pulse.style.borderRadius = '9999px';
  pulse.style.background = 'rgba(24, 24, 27, 0.22)';
  pulse.style.pointerEvents = 'none';
  pulse.style.transform = 'scale(1)';
  pulse.style.opacity = '0.75';
  pulse.style.transition = 'opacity 220ms ease';

  var pulseTick = 0;
  setInterval(function () {
    if (open) return;
    pulseTick = pulseTick ? 0 : 1;
    pulse.style.transform = pulseTick ? 'scale(1.22)' : 'scale(1)';
    pulse.style.opacity = pulseTick ? '0.15' : '0.75';
  }, 1200);

  var open = false;
  function applyState() {
    if (open) {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0) scale(1)';
      panel.style.pointerEvents = 'auto';
      pulse.style.opacity = '0';
    } else {
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(18px) scale(0.98)';
      panel.style.pointerEvents = 'none';
      pulse.style.opacity = '0.75';
    }
  }
  launcher.addEventListener('click', function () {
    open = !open;
    applyState();
  });

  function applyMobileLayout() {
    if (window.matchMedia('(max-width: 640px)').matches) {
      panel.style.left = '12px';
      panel.style.right = '12px';
      panel.style.width = 'calc(100vw - 24px)';
      panel.style.height = 'calc(100dvh - 104px)';
      panel.style.maxHeight = 'calc(100dvh - 104px)';
      panel.style.bottom = (launcherSize + 16) + 'px';
    } else {
      panel.style.left = '';
      panel.style.right = '0';
      panel.style.width = '400px';
      panel.style.height = '600px';
      panel.style.maxHeight = 'calc(100vh - 96px)';
      panel.style.bottom = (launcherSize + 12) + 'px';
    }
  }
  applyMobileLayout();
  window.addEventListener('resize', applyMobileLayout);

  host.appendChild(panel);
  host.appendChild(pulse);
  host.appendChild(launcher);
  document.body.appendChild(host);
  applyState();

  fetch('${origin}/api/widget/script?format=meta&agentId=' + encodeURIComponent(agentId))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (meta) {
      if (!meta) return;
      if (meta.themeColor) {
        launcher.style.background = meta.themeColor;
        pulse.style.background = meta.themeColor + '33';
      }
      if (meta.avatarUrl) {
        launcher.innerHTML = '';
        launcher.style.padding = '8px';
        var img = document.createElement('img');
        img.src = meta.avatarUrl;
        img.alt = 'Avatar chatbot';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '9999px';
        launcher.appendChild(img);
      }
    })
    .catch(function () {});
})();`;
}

