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

  it("补全交付目标/并发审核/Web 地址等缺失错误码映射", () => {
    expect(
      toApplicationErrorMessage(
        new ApiError(400, "DELIVERY_TARGETS_INCOMPLETE", undefined, "trace-dt"),
      ),
    ).toBe("小程序渠道需配置已启用的交付目标（含二维码）（追踪 ID：trace-dt）");
    expect(
      toApplicationErrorMessage(new ApiError(400, "REVIEW_ALREADY_PENDING")),
    ).toBe("已有版本正在审核中，请等待审核结束");
    expect(
      toApplicationErrorMessage(new ApiError(400, "WEB_DELIVERY_URL_MISSING")),
    ).toBe("交付地址未配置，请先在编辑器中配置应用地址");
    expect(
      toApplicationErrorMessage(new ApiError(400, "SELF_REVIEW_FORBIDDEN")),
    ).toBe("不能审核自己参与的应用");
    expect(
      toApplicationErrorMessage(new ApiError(400, "WITHDRAW_REASON_REQUIRED")),
    ).toBe("请填写下架原因");
  });

  it("映射 Web 交付地址白名单策略错误码（WEB_URL_* 家族）", () => {
    expect(
      toApplicationErrorMessage(new ApiError(400, "WEB_URL_INVALID")),
    ).toBe("交付地址无效");
    expect(
      toApplicationErrorMessage(
        new ApiError(400, "WEB_URL_CREDENTIALS_FORBIDDEN"),
      ),
    ).toBe("交付地址禁止携带账号凭据");
    expect(
      toApplicationErrorMessage(new ApiError(400, "WEB_URL_HOST_NOT_ALLOWED")),
    ).toBe("交付地址域名不在白名单内");
    expect(
      toApplicationErrorMessage(new ApiError(400, "WEB_URL_CIDR_NOT_ALLOWED")),
    ).toBe("交付地址解析到的网段不在白名单内");
  });

  it("映射小程序二维码校验错误码（QR_* 家族）", () => {
    expect(
      toApplicationErrorMessage(new ApiError(400, "QR_VALIDATION_UNAVAILABLE")),
    ).toBe("二维码校验服务不可用，请稍后重试");
    expect(
      toApplicationErrorMessage(new ApiError(400, "QR_TARGET_FORMAT_INVALID")),
    ).toBe("二维码目标格式无效");
    expect(
      toApplicationErrorMessage(new ApiError(400, "QR_DECODE_FAILED")),
    ).toBe("二维码无法解析");
  });

  it("交付渠道文案按类型门禁描述而非全部四个渠道", () => {
    expect(
      toApplicationErrorMessage(
        new ApiError(400, "DELIVERY_CHANNELS_INCOMPLETE"),
      ),
    ).toBe("请按应用类型配置对应交付渠道");
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
