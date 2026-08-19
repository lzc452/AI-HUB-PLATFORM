import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { FieldValues, Resolver } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { applicationDraftDefaults, applicationDraftFormSchema } from "./schema";
import { AudienceField, createWizardSteps, FaqField } from "./steps";
import type { PublishingOptions } from "./steps";

const OPTIONS: PublishingOptions = {
  departments: [
    { value: "dept-rnd", label: "研发部" },
    { value: "dept-ops", label: "运营部" },
  ],
  categories: [],
  tags: [],
  employees: [
    { value: "E100", label: "张三" },
    { value: "E200", label: "李四" },
  ],
};

/** 探针：暴露当前 audience 表单值，便于断言 UI 交互生成的规则数组。 */
function AudienceProbe() {
  const audience = useWatch({ name: "audience" });
  return <div data-testid="audience-probe">{JSON.stringify(audience)}</div>;
}

function Harness({ defaultValues }: { defaultValues: FieldValues }) {
  const form = useForm<FieldValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(
      applicationDraftFormSchema,
    ) as unknown as Resolver<FieldValues>,
  });
  return (
    <FormProvider {...form}>
      <AudienceField options={OPTIONS} />
      <AudienceProbe />
    </FormProvider>
  );
}

function probeValue(): unknown[] {
  const node = document.querySelector<HTMLElement>(
    '[data-testid="audience-probe"]',
  );
  expect(node).not.toBeNull();
  return JSON.parse(node?.textContent ?? "[]") as unknown[];
}

/** 在指定下拉（0=部门，1=员工）中选择一项，并关闭下拉。 */
async function pickOption(selectIndex: 0 | 1, label: string) {
  const comboboxes = screen.getAllByRole("combobox");
  fireEvent.mouseDown(comboboxes[selectIndex]!);
  let option: HTMLElement | undefined;
  await waitFor(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-select-item-option-content"),
    );
    option = items.find((item) => item.textContent === label);
    expect(option).toBeTruthy();
  });
  fireEvent.click(option!);
  fireEvent.keyDown(comboboxes[selectIndex]!, { key: "Escape" });
}

describe("AudienceField（多选 → 多条 AudienceRule）", () => {
  it("默认值（all 规则）回显：全体员工开关打开", () => {
    render(<Harness defaultValues={applicationDraftDefaults} />);
    expect(screen.getByRole("switch", { name: "全体员工" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(probeValue()).toEqual([
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
    ]);
  });

  it("多选部门 + 员工生成多条标量规则，包含子部门为全局开关", async () => {
    render(
      <Harness defaultValues={{ ...applicationDraftDefaults, audience: [] }} />,
    );
    // 部门多选：每个部门一条规则。
    await pickOption(0, "研发部");
    await pickOption(0, "运营部");
    fireEvent.click(screen.getByRole("checkbox", { name: /包含子部门/ }));
    // 员工多选：每名员工一条规则。
    await pickOption(1, "张三");
    await pickOption(1, "李四");

    await waitFor(() => {
      expect(probeValue()).toEqual([
        {
          audienceType: "department",
          departmentId: "dept-rnd",
          employeeId: null,
          includeChildren: true,
        },
        {
          audienceType: "department",
          departmentId: "dept-ops",
          employeeId: null,
          includeChildren: true,
        },
        {
          audienceType: "employee",
          departmentId: null,
          employeeId: "E100",
          includeChildren: false,
        },
        {
          audienceType: "employee",
          departmentId: null,
          employeeId: "E200",
          includeChildren: false,
        },
      ]);
    });
  });

  it("全体员工开关生成 all 规则", async () => {
    render(
      <Harness defaultValues={{ ...applicationDraftDefaults, audience: [] }} />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "全体员工" }));
    await waitFor(() => {
      expect(probeValue()).toEqual([
        {
          audienceType: "all",
          departmentId: null,
          employeeId: null,
          includeChildren: false,
        },
      ]);
    });
  });

  it("编辑回显：多部门/多员工规则反解为 UI 选择", () => {
    render(
      <Harness
        defaultValues={{
          ...applicationDraftDefaults,
          audience: [
            {
              audienceType: "all",
              departmentId: null,
              employeeId: null,
              includeChildren: false,
            },
            {
              audienceType: "department",
              departmentId: "dept-rnd",
              employeeId: null,
              includeChildren: true,
            },
            {
              audienceType: "department",
              departmentId: "dept-ops",
              employeeId: null,
              includeChildren: false,
            },
            {
              audienceType: "employee",
              departmentId: null,
              employeeId: "E100",
              includeChildren: false,
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("switch", { name: "全体员工" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /包含子部门/ })).toBeChecked();
    const selected = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-select-selection-item"),
    );
    expect(selected.map((item) => item.getAttribute("title"))).toEqual([
      "研发部",
      "运营部",
      "张三",
    ]);
  });

  it("全部不选时显示校验错误（受众规则至少一条）", async () => {
    render(
      <Harness defaultValues={{ ...applicationDraftDefaults, audience: [] }} />,
    );
    const switchEl = screen.getByRole("switch", { name: "全体员工" });
    // 开关两次往返后回到空数组，触发 validate。
    fireEvent.click(switchEl);
    fireEvent.click(switchEl);
    await waitFor(() => {
      expect(screen.getByText("受众规则至少一条")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// FAQ 编辑器
// ---------------------------------------------------------------------------

function FaqProbe() {
  const faq = useWatch({ name: "faq" });
  return <div data-testid="faq-probe">{JSON.stringify(faq)}</div>;
}

function FaqHarness({ defaultValues }: { defaultValues: FieldValues }) {
  const form = useForm<FieldValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(
      applicationDraftFormSchema,
    ) as unknown as Resolver<FieldValues>,
  });
  return (
    <FormProvider {...form}>
      <FaqField />
      <FaqProbe />
      <button onClick={() => void form.trigger("faq")} type="button">
        触发校验
      </button>
    </FormProvider>
  );
}

function faqProbeValue(): Array<{ question: string; answer: string }> {
  const node = document.querySelector<HTMLElement>('[data-testid="faq-probe"]');
  expect(node).not.toBeNull();
  // undefined 会被 JSON.stringify 序列化为空串，用 || 而非 ?? 兜底。
  return JSON.parse(node?.textContent || "[]") as Array<{
    question: string;
    answer: string;
  }>;
}

describe("FaqField（常见问题增删编辑）", () => {
  it("添加问题后输入问题与回答，faq 数组写入表单", async () => {
    render(<FaqHarness defaultValues={applicationDraftDefaults} />);
    fireEvent.click(screen.getByRole("button", { name: /添加问题/ }));
    expect(faqProbeValue()).toEqual([{ question: "", answer: "" }]);

    fireEvent.change(screen.getByLabelText("问题 1"), {
      target: { value: "如何重置密码？" },
    });
    fireEvent.change(screen.getByLabelText("回答 1"), {
      target: { value: "联系管理员" },
    });
    await waitFor(() => {
      expect(faqProbeValue()).toEqual([
        { question: "如何重置密码？", answer: "联系管理员" },
      ]);
    });
  });

  it("删除按钮移除对应行，剩余行保留", async () => {
    render(
      <FaqHarness
        defaultValues={{
          ...applicationDraftDefaults,
          faq: [
            { question: "Q1", answer: "A1" },
            { question: "Q2", answer: "A2" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除问题 2" }));
    await waitFor(() => {
      expect(faqProbeValue()).toEqual([{ question: "Q1", answer: "A1" }]);
    });
  });

  it("旧草稿无 faq 时回显空列表可编辑，不报错", async () => {
    const draft = { ...applicationDraftDefaults };
    delete (draft as { faq?: unknown }).faq;
    render(<FaqHarness defaultValues={draft} />);
    expect(faqProbeValue()).toEqual([]);
    expect(screen.getByRole("button", { name: /添加问题/ })).toBeTruthy();
  });

  it("空列表触发必填校验错误（至少填写一条常见问题）", async () => {
    render(<FaqHarness defaultValues={applicationDraftDefaults} />);
    fireEvent.click(screen.getByRole("button", { name: "触发校验" }));
    await waitFor(() => {
      expect(screen.getByText("至少填写一条常见问题")).toBeInTheDocument();
    });
  });

  it("条目内容为空时提示问题不能为空", async () => {
    render(<FaqHarness defaultValues={applicationDraftDefaults} />);
    fireEvent.click(screen.getByRole("button", { name: /添加问题/ }));
    fireEvent.click(screen.getByRole("button", { name: "触发校验" }));
    await waitFor(() => {
      expect(screen.getByText("问题不能为空")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 预览步完整渲染
// ---------------------------------------------------------------------------

function PreviewHarness({ defaultValues }: { defaultValues: FieldValues }) {
  const form = useForm<FieldValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(
      applicationDraftFormSchema,
    ) as unknown as Resolver<FieldValues>,
  });
  const steps = createWizardSteps(OPTIONS, "app-1");
  return <FormProvider {...form}>{steps[3]!.render(form)}</FormProvider>;
}

describe("PreviewStep（提交前核对交付目标 / FAQ / 风险 / 受众）", () => {
  const previewDefaults: FieldValues = {
    ...applicationDraftDefaults,
    name: "智能考勤助手",
    departmentId: "dept-rnd",
    maintainerEmployeeIds: ["E100"],
    categoryId: "cat-1",
    tagIds: ["效率"],
    applicationType: "mini_program",
    audience: [
      {
        audienceType: "department",
        departmentId: "dept-rnd",
        employeeId: null,
        includeChildren: true,
      },
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E200",
        includeChildren: false,
      },
    ],
    faq: [{ question: "如何重置密码？", answer: "联系管理员" }],
    risk: {
      ...applicationDraftDefaults.risk,
      retentionPeriod: "30 天",
      providerNote: "内部部署 + DeepSeek",
      modelProviders: ["local", "deepseek"],
    },
    deliveries: [
      {
        channel: "mini_program",
        entryUrl: "https://example.com/entry",
        minClientVersion: "1.2.0",
        enabled: true,
        assetIds: [],
        targets: [
          { kind: "desktop", os: "windows", arch: "x64" },
          {
            kind: "miniprogram",
            platform: "wechat",
            appId: "wx123456",
            qrCodeAssetId: "qr-1",
            versionNote: "v2 上线",
            enabled: true,
          },
        ],
      },
    ],
  };

  it("渲染交付渠道、入口地址、最低版本与全部交付目标", () => {
    render(<PreviewHarness defaultValues={previewDefaults} />);
    expect(screen.getByText("小程序渠道")).toBeTruthy();
    expect(
      screen.getByText(/入口地址：https:\/\/example.com\/entry/),
    ).toBeTruthy();
    expect(screen.getByText(/最低客户端版本：1.2.0/)).toBeTruthy();
    // 桌面目标：OS + 架构。
    expect(screen.getByText("· 桌面端：Windows（x64）")).toBeTruthy();
    // 小程序目标：平台 + AppId + 二维码 + 版本说明。
    expect(
      screen.getByText(
        "· 小程序（微信）：AppId：wx123456；二维码：已上传；版本说明：v2 上线",
      ),
    ).toBeTruthy();
  });

  it("渲染 FAQ 列表（Q/A 逐条）", () => {
    render(<PreviewHarness defaultValues={previewDefaults} />);
    expect(screen.getByText("Q1：如何重置密码？")).toBeTruthy();
    expect(screen.getByText("A：联系管理员")).toBeTruthy();
  });

  it("渲染风险全字段：保留周期与提供方说明", () => {
    render(<PreviewHarness defaultValues={previewDefaults} />);
    expect(screen.getByText(/保留周期：30 天/)).toBeTruthy();
    expect(screen.getByText(/提供方说明：内部部署 \+ DeepSeek/)).toBeTruthy();
    expect(screen.getByText(/模型提供方：local、deepseek/)).toBeTruthy();
  });

  it("渲染受众具体项：部门（含子部门）与员工姓名", () => {
    render(<PreviewHarness defaultValues={previewDefaults} />);
    expect(screen.getByText(/研发部（含子部门）/)).toBeTruthy();
    expect(screen.getByText(/李四/)).toBeTruthy();
  });

  it("无交付 / 无 FAQ 时显示占位符，不报错", () => {
    const minimal = { ...applicationDraftDefaults, name: "最小应用" };
    render(<PreviewHarness defaultValues={minimal} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Web 应用")).toBeTruthy();
  });
});
