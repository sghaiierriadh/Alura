import type { NextConfig } from "next";

/**
 * Origines autorisées à intégrer `/widget` ou `/embed` en iframe (CSP `frame-ancestors`).
 * Exemple : `'self' https://club-priveleges.example https://autre-partenaire.example`
 * ou `*` pour autoriser tout hôte parent (widget exportable maximal).
 */
const widgetFrameAncestors =
  process.env.WIDGET_CSP_FRAME_ANCESTORS?.trim() || "* chrome-extension: file:";

const widgetSecurityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors ${widgetFrameAncestors};`,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  /* Ne pas créer de dossier vide `app/` à la racine : Next le résout avant `src/app`. */
  serverExternalPackages: ["pdf-parse", "mammoth"],
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/widget/:path*",
        headers: widgetSecurityHeaders,
      },
      {
        source: "/embed/:path*",
        headers: widgetSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
