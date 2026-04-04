import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Ne pas créer de dossier vide `app/` à la racine : Next le résout avant `src/app`. */
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
