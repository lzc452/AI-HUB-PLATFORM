ARG NODE_IMAGE=node:24.15.0-bookworm-slim

FROM ${NODE_IMAGE} AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile

FROM workspace AS development
CMD ["pnpm", "--filter", "@ai-hub/api", "dev"]

FROM workspace AS production
ENV NODE_ENV=production
RUN pnpm --filter @ai-hub/api build
CMD ["sh", "-c", "pnpm migrate && exec pnpm --filter @ai-hub/api start"]
