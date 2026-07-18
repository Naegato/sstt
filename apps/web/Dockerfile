# Contexte de build : la racine du monorepo (workspaces Bun), pas apps/web/
# — voir .github/workflows/deploy.yml (`docker build -f apps/web/Dockerfile .`).

FROM oven/bun:1 AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* sont inlinés dans le bundle client au build — doivent donc être
# fournis ici (build-arg), pas seulement comme variable d'env au runtime.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
RUN bun run --filter=@card-game/web build

# `output: "standalone"` (next.config.ts) ne copie que le strict nécessaire à
# l'exécution — sortie tracée dans apps/web/.next/standalone/, pas node_modules complet.
FROM oven/bun:1-slim AS runner
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
WORKDIR /repo/apps/web
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "server.js"]
