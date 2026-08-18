import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormWizard, type WizardStepConfig } from "./FormWizard";

const hoisted = vi.hoisted(() => ({
  showErrorMessage: vi.fn(),
}));

vi.mock("../ui/message", () => ({
  showErrorMessage: hoisted.showErrorMessage,
}));

const steps: WizardStepConfig[] = [
  {
    key: "info",
    title: "基本信息",
    fields: [],
    render: () => <div>step-content</div>,
  },
];

describe("FormWizard 提交错误处理", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
  });

  it("提交失败时恢复按钮状态并通过全局消息提示", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("草稿未通过提交校验");
    });
    render(
      <FormWizard
        steps={steps}
        defaultValues={{}}
        onSaveDraft={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const button = screen.getByRole("button", { name: "提交审核" });
    fireEvent.click(button);
    await waitFor(() => {
      expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
        "提交失败",
      );
    });

    // loading 已恢复：按钮可再次点击并重新触发提交。
    await waitFor(() => {
      expect(button).not.toHaveClass("ant-btn-loading");
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(hoisted.showErrorMessage).toHaveBeenCalledTimes(2);
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("提交成功后不提示错误", async () => {
    render(
      <FormWizard
        steps={steps}
        defaultValues={{}}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn(async () => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    await waitFor(() => {
      expect(hoisted.showErrorMessage).not.toHaveBeenCalled();
    });
  });
});
