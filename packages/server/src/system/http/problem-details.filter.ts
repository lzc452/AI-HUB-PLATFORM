import type { ProblemDetails } from "@ai-hub/contracts";
import type { ArgumentsHost } from "@nestjs/common";
import {
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import type { Logger } from "pino";
import { ZodError } from "zod";

import { getTraceId } from "../observability/request-context.middleware.js";
import { OBSERVABILITY_LOGGER } from "../observability/tokens.js";

interface ResponseLike {
  status(code: number): ResponseLike;
  type(contentType: string): ResponseLike;
  send(body: ProblemDetails): unknown;
}

const STATUS_DETAILS: Readonly<
  Record<number, Readonly<{ title: string; code: string }>>
> = {
  [HttpStatus.BAD_REQUEST]: { title: "Bad Request", code: "BAD_REQUEST" },
  [HttpStatus.UNAUTHORIZED]: { title: "Unauthorized", code: "UNAUTHORIZED" },
  [HttpStatus.FORBIDDEN]: { title: "Forbidden", code: "FORBIDDEN" },
  [HttpStatus.NOT_FOUND]: { title: "Not Found", code: "NOT_FOUND" },
  [HttpStatus.CONFLICT]: { title: "Conflict", code: "CONFLICT" },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    title: "Unprocessable Entity",
    code: "UNPROCESSABLE_ENTITY",
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    title: "Too Many Requests",
    code: "TOO_MANY_REQUESTS",
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    title: "Service Unavailable",
    code: "SERVICE_UNAVAILABLE",
  },
};

function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "_root";
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function toProblemDetails(
  exception: unknown,
  traceId: string,
): ProblemDetails {
  if (exception instanceof ZodError) {
    return {
      type: "about:blank",
      title: "Validation Failed",
      status: HttpStatus.BAD_REQUEST,
      code: "VALIDATION_ERROR",
      traceId,
      fieldErrors: zodFieldErrors(exception),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const details = STATUS_DETAILS[status] ?? {
      title: "Request Failed",
      code: "HTTP_ERROR",
    };
    return {
      type: "about:blank",
      title: details.title,
      status,
      code: details.code,
      traceId,
    };
  }

  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    traceId,
  };
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public constructor(
    @Inject(OBSERVABILITY_LOGGER) private readonly logger: Logger,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const traceId = getTraceId();
    const problem = toProblemDetails(exception, traceId);

    if (
      !(exception instanceof HttpException) &&
      !(exception instanceof ZodError)
    ) {
      this.logger.error(
        {
          traceId,
          errorType:
            exception instanceof Error ? exception.name : typeof exception,
        },
        "Unhandled request error",
      );
    }

    host
      .switchToHttp()
      .getResponse<ResponseLike>()
      .status(problem.status)
      .type("application/problem+json")
      .send(problem);
  }
}
