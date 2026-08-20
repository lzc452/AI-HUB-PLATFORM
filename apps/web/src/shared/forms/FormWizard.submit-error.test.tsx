import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Controller } from "react-hook-form";
import type { FieldValues, Resolver } from "react-hook-form";
import { Input } from "antd";
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

// ---------------------------------------------------------------------------
// onNextSuccess 门禁：校验通过才调用；await 完成才切换；失败不前进
// （草稿惰性创建依赖该契约：校验不通过不产生空草稿）。
// ---------------------------------------------------------------------------

/** 第一步校验 name 非空；第二步无输入。 */
const nextSteps: WizardStepConfig[] = [
  {
    key: "basic",
    title: "第一步",
    fields: ["name"],
    render: (form) => (
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <>
            <Input aria-label="应用名称" {...field} />
            {fieldState.error !== undefined ? (
              <span>{fieldState.error.message}</span>
            ) : null}
          </>
        )}
      />
    ),
  },
  {
    key: "content",
    title: "第二步",
    fields: [],
    render: () => <div>第二步内容</div>,
  },
];

const nameResolver: Resolver<FieldValues> = async (values) => {
  const name = values.name as string | undefined;
  if (typeof name !== "string" || name.trim().length === 0) {
    return {
      values: {},
      errors: {
        name: { type: "required", message: "应用名称不能为空" },
      },
    };
  }
  return { values, errors: {} };
};

/** antd Steps 当前激活步骤标题。 */
const activeStepTitle = () =>
  document.querySelector(".ant-steps-item-active .ant-steps-item-title")
    ?.textContent;

describe("下一步门禁：校验通过才调用 onNextSuccess 并推进", () => {
  it("校验不通过时不调用 onNextSuccess，且不切换步骤", async () => {
    const onNextSuccess = vi.fn(async () => {});
    render(
      <FormWizard
        steps={nextSteps}
        defaultValues={{}}
        onNextSuccess={onNextSuccess}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        resolver={nameResolver}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => {
      expect(screen.getByText("应用名称不能为空")).toBeInTheDocument();
    });
    expect(onNextSuccess).not.toHaveBeenCalled();
    expect(activeStepTitle()).toBe("第一步");
  });

  it("校验通过后先 await onNextSuccess 完成，再切换步骤", async () => {
    let resolveNext!: () => void;
    const onNextSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNext = resolve;
        }),
    );
    render(
      <FormWizard
        steps={nextSteps}
        defaultValues={{ name: "测试应用" }}
        onNextSuccess={onNextSuccess}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        resolver={nameResolver}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => expect(onNextSuccess).toHaveBeenCalled());
    // 副作用（如草稿创建）未完成：仍停留在当前步。
    expect(activeStepTitle()).toBe("第一步");
    await act(async () => {
      resolveNext();
    });
    expect(activeStepTitle()).toBe("第二步");
  });

  it("onNextSuccess 抛错时不前进，且按钮 loading 状态恢复", async () => {
    const onNextSuccess = vi.fn(async () => {
      throw new Error("草稿创建失败");
    });
    render(
      <FormWizard
        steps={nextSteps}
        defaultValues={{ name: "测试应用" }}
        onNextSuccess={onNextSuccess}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        resolver={nameResolver}
      />,
    );

    const nextButton = screen.getByRole("button", { name: "下一步" });
    fireEvent.click(nextButton);
    await waitFor(() => expect(onNextSuccess).toHaveBeenCalled());
    expect(activeStepTitle()).toBe("第一步");
    await waitFor(() => expect(nextButton).not.toHaveClass("ant-btn-loading"));
  });

  it("快速连续点击下一步只推进一次（防跳过步骤）", async () => {
    let resolveNext!: () => void;
    const onNextSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNext = resolve;
        }),
    );
    render(
      <FormWizard
        steps={nextSteps}
        defaultValues={{ name: "测试应用" }}
        onNextSuccess={onNextSuccess}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        resolver={nameResolver}
      />,
    );

    const nextButton = screen.getByRole("button", { name: "下一步" });
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    // 第二次点击被进行中守卫拦截：onNextSuccess 只触发一次（waitFor 轮询等待
    // 异步校验落定；若守卫失效会观察到 2 次调用并超时失败）。
    await waitFor(() => expect(onNextSuccess).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveNext();
    });
    // 只前进一步。
    expect(activeStepTitle()).toBe("第二步");
  });
});
