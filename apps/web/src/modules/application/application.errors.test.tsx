import { describe, expect, it } from "vitest";

import { ApiError } from "../../shared/api/client";
import {
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

  it("为恶意文件扫描失败提供可操作提示", () => {
    expect(getArtifactUploadErrorMessage("MALWARE_DETECTED")).toBe(
      "检测到恶意文件，请更换制品后重试",
    );
  });
});
