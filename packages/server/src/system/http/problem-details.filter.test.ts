import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { toProblemDetails } from "./problem-details.filter.js";

const traceId = "01JZ3M8V9Z3V4F2V3K0R4Y8P6S";

describe("toProblemDetails", () => {
  it("hides internal error details from the caller", () => {
    const problem = toProblemDetails(
      new Error("connect postgres://user:secret@postgres:5432/ai_hub"),
      traceId,
    );

    expect(problem).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "INTERNAL_ERROR",
      traceId,
    });
    expect(JSON.stringify(problem)).not.toContain("secret");
  });

  it("preserves a safe domain code for Nest HTTP exceptions", () => {
    expect(
      toProblemDetails(
        new BadRequestException("RATING_STARS_INVALID"),
        traceId,
      ),
    ).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "RATING_STARS_INVALID",
      traceId,
    });
  });

  it("does not expose an unsafe HTTP exception message", () => {
    expect(
      toProblemDetails(
        new BadRequestException("password=do-not-return-this"),
        traceId,
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("maps Zod issues to field errors", () => {
    const schema = z.object({ displayName: z.string().min(3) });
    const error = schema.safeParse({ displayName: "x" }).error;

    expect(toProblemDetails(error, traceId)).toEqual({
      type: "about:blank",
      title: "Validation Failed",
      status: 400,
      code: "VALIDATION_ERROR",
      traceId,
      fieldErrors: {
        displayName: [expect.any(String)],
      },
    });
  });
});
