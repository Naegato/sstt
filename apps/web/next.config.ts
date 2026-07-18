import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
