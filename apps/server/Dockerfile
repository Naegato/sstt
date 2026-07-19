# Contexte de build : la racine du monorepo (workspaces Bun), pas apps/server/
# — voir .github/workflows/deploy.yml (`docker build -f apps/server/Dockerfile .`).

FROM oven/bun:1 AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run --filter=@card-game/server build

FROM oven/bun:1-slim AS runner
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
# Seul le CSV est lu au runtime (loadCatalog() dans cards-catalog.ts) — les
# visuels des cartes (assets/cards/*.jpg) ne sont jamais servis par le serveur.
COPY --from=build /repo/assets/cards/cards.csv ./assets/cards/cards.csv
ENV ASSETS_DIR=/repo/assets
# Stampé sur chaque event persisté en base (voir config.API_VERSION,
# db/game-events-repository.ts) pour ne jamais confondre un bug observé avec
# une version différente du moteur — passé par --build-arg GIT_SHA=${{ github.sha }}.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
WORKDIR /repo/apps/server
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
