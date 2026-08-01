ARG NODE_IMAGE=node:24.15.0-bookworm-slim
ARG DOCKER_CLI_IMAGE=docker:29.4.1-cli

FROM ${DOCKER_CLI_IMAGE} AS docker-cli

FROM ${NODE_IMAGE} AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile

FROM workspace AS development
CMD ["pnpm", "--filter", "@ai-hub/api", "dev"]

FROM workspace AS test
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
CMD ["pnpm", "verify"]

FROM workspace AS production
ENV NODE_ENV=production
RUN pnpm --filter @ai-hub/api build
CMD ["sh", "-c", "pnpm migrate && exec pnpm --filter @ai-hub/api start"]
