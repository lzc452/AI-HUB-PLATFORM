ARG NODE_IMAGE=node:24.15.0-bookworm-slim

FROM ${NODE_IMAGE} AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile

FROM workspace AS development
CMD ["pnpm", "--filter", "@ai-hub/web", "dev", "--host", "0.0.0.0"]

FROM workspace AS build
RUN pnpm --filter @ai-hub/web build

FROM nginx:1.29.4-alpine AS production
COPY infra/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
