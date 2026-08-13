import type { NestExpressApplication } from "@nestjs/platform-express";

export const JSON_BODY_LIMIT = "1mb";

export function configureApiBodyParsers(
  app: NestExpressApplication,
  artifactMaxSizeBytes: number,
): void {
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.useBodyParser("raw", {
    limit: artifactMaxSizeBytes,
    type: ["application/octet-stream"],
  });
}
