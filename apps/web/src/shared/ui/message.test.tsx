import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("antd", () => ({ message: messageApi }));

import {
  MessageError,
  MessageWarning,
  getMessageContent,
  showSuccessMessage,
  showWarningMessage,
} from "./message";

describe("Message 反馈", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("将错误上下文与详情合并为一次 error 提示，并避免重复渲染重复提示", () => {
    const cause = new Error("网络异常");
    const { container, rerender } = render(
      <MessageError cause={cause} title="应用列表加载失败" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(messageApi.error).toHaveBeenCalledTimes(1);
    expect(messageApi.error).toHaveBeenCalledWith(
      "应用列表加载失败：网络异常",
    );

    rerender(<MessageError cause={cause} title="应用列表加载失败" />);
    expect(messageApi.error).toHaveBeenCalledTimes(1);
  });

  it("停用后再次启用同一错误时可以重新提示", () => {
    const cause = new Error("请求失败");
    const { rerender } = render(
      <MessageError cause={cause} title="加载失败" />,
    );

    rerender(
      <MessageError active={false} cause={cause} title="加载失败" />,
    );
    rerender(<MessageError cause={cause} title="加载失败" />);

    expect(messageApi.error).toHaveBeenCalledTimes(2);
  });

  it("使用 warning 组件和 success/warning 命令区分非错误反馈", () => {
    render(<MessageWarning content="助手暂时不可用" />);
    showWarningMessage("请先选择一个应用");
    showSuccessMessage("应用已保存");

    expect(messageApi.warning).toHaveBeenNthCalledWith(1, "助手暂时不可用");
    expect(messageApi.warning).toHaveBeenNthCalledWith(2, "请先选择一个应用");
    expect(messageApi.success).toHaveBeenCalledWith("应用已保存");
  });

  it("未知错误使用 fallback，字符串错误保留详情", () => {
    expect(getMessageContent(new Error("失败详情"), "操作失败")).toBe(
      "操作失败：失败详情",
    );
    expect(getMessageContent("权限不足", "操作失败")).toBe(
      "操作失败：权限不足",
    );
    expect(getMessageContent({ code: "UNKNOWN" }, "操作失败")).toBe(
      "操作失败",
    );
  });
});
