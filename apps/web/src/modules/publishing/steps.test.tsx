import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { FieldValues, Resolver } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { applicationDraftDefaults, applicationDraftFormSchema } from "./schema";
import { AudienceField } from "./steps";
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
