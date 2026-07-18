import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker minimale (voir apps/web/Dockerfile) : ne copie que le strict
  // nécessaire à l'exécution, pas node_modules complet.
  output: "standalone",
  // Le typecheck (tsc --noEmit) et le lint tournent déjà comme étape dédiée du
  // job CI "test" (voir .github/workflows/deploy.yml) — les refaire pendant
  // `next build` est redondant et alourdit le pic mémoire du build, sensible
  // sur le runner self-hosted (swarm, RAM limitée).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@card-game/shared-types"],
  webpack: (config) => {
    // Nos packages du workspace utilisent des imports relatifs en ".js" (résolution
    // "bundler" côté Bun/tsc, qui mappe .js → .ts). Le resolver webpack de Next.js
    // ne le fait pas nativement : on l'aligne ici.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
