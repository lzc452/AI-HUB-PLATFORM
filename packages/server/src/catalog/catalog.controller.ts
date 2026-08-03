import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Body,
  Query,
} from "@nestjs/common";
import type { ActorContext } from "@ai-hub/contracts";
import { IdentityService } from "../identity/identity.service.js";
import { CATALOG_SERVICE } from "./catalog.tokens.js";
import { CatalogService } from "./catalog.service.js";
import type { CatalogSearchInput } from "./catalog.types.js";

@Controller("/internal/catalog")
export class CatalogController {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalog: CatalogService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get()
  async list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Query("query") query?: string,
    @Query("categoryId") categoryId?: string,
    @Query("applicationType") applicationType?: string,
    @Query("sort") sort?: "recommended" | "latest" | "popular",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const input: CatalogSearchInput = {
      actor: await this.requireActor(employeeId, sessionId),
      sort: sort ?? "recommended",
      page: this.parsePositive(page, 1),
      pageSize: this.parsePositive(pageSize, 20),
      ...(query === undefined ? {} : { query }),
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(applicationType === undefined ? {} : { applicationType }),
    };
    return this.call(() => this.catalog.list(input));
  }

  @Get(":applicationId")
  async detail(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.catalog.getDetail(
        await this.requireActor(employeeId, sessionId),
        applicationId,
      ),
    );
  }

  @Post(":applicationId/actions")
  async recordAction(
    @Param("applicationId") applicationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      actionType: "web_redirect" | "package_download" | "qr_display";
      channel?: string;
    },
  ) {
    return this.call(async () => {
      await this.catalog.recordDeliveryAction(
        await this.requireActor(employeeId, sessionId),
        { applicationId, ...body },
      );
      return { recorded: true };
    });
  }

  private async requireActor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ): Promise<ActorContext> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action: "read",
      resourceType: "catalog",
    });
    if (!decision.allowed) throw new ForbiddenException("NOT_AUTHORIZED");
    return actor;
  }

  private parsePositive(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException("CATALOG_PAGINATION_INVALID");
    }
    return parsed;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "CATALOG_REQUEST_FAILED";
      if (code === "CATALOG_APPLICATION_NOT_FOUND") {
        throw new NotFoundException(code);
      }
      if (code === "NOT_AUTHORIZED") throw new ForbiddenException(code);
      throw new BadRequestException(code);
    }
  }
}
