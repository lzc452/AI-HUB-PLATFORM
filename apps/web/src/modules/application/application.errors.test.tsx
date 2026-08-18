import { describe, expect, it } from "vitest";

import { ApiError } from "../../shared/api/client";
import {
  formatSubmitError,
  getArtifactUploadErrorMessage,
  toApplicationErrorMessage,
} from "./application.errors";

describe("application errors adapter", () => {
  it("将已知领域错误转换为含追踪 ID 的中文提示", () => {
    expect(
      toApplicationErrorMessage(
        new ApiError(400, "APPLICATION_OWNER_REQUIRED", undefined, "trace-1"),
      ),
    ).toBe("仅应用负责人可以执行此操作（追踪 ID：trace-1）");
  });

  it("保留未知错误供统一错误展示处理", () => {
    const error = new ApiError(400, "FUTURE_DOMAIN_CODE");
    expect(toApplicationErrorMessage(error)).toBe(error);
  });

  it("将未签名制品确认错误转换为可操作提示", () => {
    expect(
      toApplicationErrorMessage(
        new ApiError(
          400,
          "UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION",
          undefined,
          "trace-unsigned",
        ),
      ),
    ).toBe("制品未签名，请勾选确认接受风险后再操作（追踪 ID：trace-unsigned）");
    expect(
      formatSubmitError(
        new ApiError(400, "UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION"),
      ),
    ).toBe("制品未签名，请勾选确认接受风险后再操作");
  });

  it("为恶意文件扫描失败提供可操作提示", () => {
    expect(getArtifactUploadErrorMessage("MALWARE_DETECTED")).toBe(
      "检测到恶意文件，请更换制品后重试",
    );
  });

  describe("formatSubmitError", () => {
    it("将 DRAFT_VALIDATION_FAILED 格式化为含问题清单的提示", () => {
      const error = new ApiError(
        400,
        "DRAFT_VALIDATION_FAILED",
        "草稿未通过提交校验",
        "trace-9",
        [
          { code: "DELIVERY_TARGETS_INCOMPLETE", message: "交付目标不完整" },
          { code: "MANUAL_HTML_REQUIRED", message: "手册内容为空" },
        ],
      );
      expect(formatSubmitError(error)).toBe(
        "草稿未通过提交校验（追踪 ID：trace-9）：\n" +
          "- 交付目标不完整\n" +
          "- 手册内容为空",
      );
    });

    it("DRAFT_VALIDATION_FAILED 无问题清单时仅展示摘要", () => {
      const error = new ApiError(
        400,
        "DRAFT_VALIDATION_FAILED",
        "草稿未通过提交校验",
      );
      expect(formatSubmitError(error)).toBe("草稿未通过提交校验");
    });

    it("已知领域错误复用映射文案", () => {
      const error = new ApiError(
        400,
        "APPLICATION_OWNER_REQUIRED",
        undefined,
        "trace-2",
      );
      expect(formatSubmitError(error)).toBe(
        "仅应用负责人可以执行此操作（追踪 ID：trace-2）",
      );
    });

    it("未知错误回退为带错误信息的通用提示", () => {
      const error = new ApiError(400, "FUTURE_DOMAIN_CODE");
      expect(formatSubmitError(error)).toBe("提交失败：FUTURE_DOMAIN_CODE");
    });
  });
});
