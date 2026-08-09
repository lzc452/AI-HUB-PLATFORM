import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AUTHORIZATION_METADATA_KEY } from "./authorization.decorator.js";
import { IdentityController } from "../identity/identity.controller.js";
import { CatalogController } from "../catalog/catalog.controller.js";
import { ApplicationController } from "../application/application.controller.js";
import { InteractionController } from "../interaction/interaction.controller.js";
import { NotificationController } from "../notification/notification.controller.js";
import { CreatorController } from "../creator/creator.controller.js";
import { DemandController } from "../demand/demand.controller.js";
import { AnalyticsController } from "../analytics/analytics.controller.js";
import { HealthController } from "../system/health/health.controller.js";
import { MetricsController } from "../system/observability/metrics.controller.js";

const controllers = [
  IdentityController,
  CatalogController,
  ApplicationController,
  InteractionController,
  NotificationController,
  CreatorController,
  DemandController,
  AnalyticsController,
  HealthController,
  MetricsController,
];
const METHOD_METADATA = "method";
const PATH_METADATA = "path";

describe("controller authorization metadata", () => {
  it("declares authorization metadata on every HTTP handler", () => {
    for (const controller of controllers) {
      const prototype = controller.prototype as unknown as Record<
        string,
        unknown
      >;
      const classMetadata = Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEY,
        controller,
      );
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[methodName];
        if (
          methodName === "constructor" ||
          typeof handler !== "function" ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined ||
          Reflect.getMetadata(PATH_METADATA, handler) === undefined
        ) {
          continue;
        }
        const methodMetadata = Reflect.getMetadata(
          AUTHORIZATION_METADATA_KEY,
          handler,
        );
        expect(
          methodMetadata ?? classMetadata,
          `${controller.name}.${methodName}`,
        ).toBeDefined();
      }
    }
  });
});
