import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { setSession } from "../../modules/auth/session.store";

const PLATFORM_USAGE = {
  byKey: [],
  byModel: [
    {
      calls: 30,
      errorCalls: 2,
      model: "Qwen3.5 35B A3B",
      totalTokens: 120000,
    },
  ],
  daily: [
    { calls: 30, errorCalls: 2, totalTokens: 120000, usageDate: "2026-10-14" },
  ],
  fromDate: "2026-10-14",
  range: "today",
  toDate: "2026-10-14",
  todayPartial: false,
  totals: {
    calls: 30,
    completionTokens: 40000,
    errorCalls: 2,
    promptTokens: 80000,
    totalTokens: 120000,
  },
};

const ADMIN_KEYS = {
  items: [
    {
      createdAt: "2026-10-01T02:00:00.000Z",
      disabledAt: null,
      effectiveStatus: "active",
      expiresAt: null,
      keyId: "key-1",
      lastUsedAt: "2026-10-14T01:30:00.000Z",
      limits: { dailyTokens: null, rpm: 60, tpm: null },
      name: "notebook-dev",
      owner: {
        displayName: "张三",
        employeeId: "E0001",
        status: "active",
      },
      prefix: "sk-aihub-abcd1234",
      status: "active",
    },
    {
      createdAt: "2026-09-15T06:00:00.000Z",
      disabledAt: "2026-10-10T08:00:00.000Z",
      effectiveStatus: "disabled",
      expiresAt: null,
      keyId: "key-2",
      lastUsedAt: null,
      limits: { dailyTokens: 2000000, rpm: null, tpm: 100000 },
      name: "ci-runner",
      owner: {
        displayName: "李四",
        employeeId: "E0002",
        status: "active",
      },
      prefix: "sk-aihub-efgh5678",
      status: "disabled",
    },
    {
      createdAt: "2026-08-01T02:00:00.000Z",
      disabledAt: null,
      effectiveStatus: "revoked",
      expiresAt: null,
      keyId: "key-3",
      lastUsedAt: "2026-09-30T12:00:00.000Z",
      limits: { dailyTokens: null, rpm: null, tpm: null },
      name: "old-key",
      owner: {
        displayName: "王五",
        employeeId: "E0003",
        status: "active",
      },
      prefix: "sk-aihub-ijkl9012",
      status: "revoked",
    },
  ],
  page: 1,
  pageSize: 20,
  total: 3,
};

function stubFetch(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
    ),
  );
}

function baseHandler(path: string): Response {
  if (path.includes("/internal/identity/actor")) {
    return Response.json({
      departmentIds: ["dept-1"],
      employeeId: "E0001",
      permissions: ["*"],
      primaryDepartmentId: "dept-1",
      roleCodes: ["employee", "super_admin"],
    });
  }
  if (path.includes("/internal/notifications")) {
    return path.includes("/internal/notifications/summary")
      ? Response.json({ unreadCount: 0 })
      : Response.json([]);
  }
  if (path.includes("/internal/model-service/admin/keys/")) {
    // 代禁用 / 代启用
    return Response.json({ ...ADMIN_KEYS.items[0], status: "disabled" });
  }
  if (path.includes("/internal/model-service/admin/keys")) {
    return Response.json(ADMIN_KEYS);
  }
  if (path.includes("/internal/model-service/admin/usage")) {
    return Response.json(PLATFORM_USAGE);
  }
  return Response.json({}, { status: 404 });
}

describe("模型服务平台管理页面", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/model-service/admin");
    setSession({ employeeId: "E0001" });
    stubFetch((path) => baseHandler(path));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it("渲染平台用量汇总与全平台 Key 列表", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "模型服务 · 平台管理" }),
    ).toBeInTheDocument();
    // 平台用量：Token 合计 120,000（KPI 与按模型构成表各一处）
    expect(await screen.findAllByText("120,000")).toHaveLength(2);
    // Key 列表：三个 Key + 归属人
    expect(screen.getByText("notebook-dev")).toBeInTheDocument();
    expect(screen.getByText("ci-runner")).toBeInTheDocument();
    expect(screen.getByText("old-key")).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
    // revoked Key 不提供操作，仅标注已撤销（筛选项与表格操作列各一处）
    expect(
      (await screen.findAllByText("已撤销")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("代禁用 Key：确认后调用禁用接口并刷新列表", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "模型服务 · 平台管理" });

    // 第一行（active）提供「禁用」按钮；antd v6 对两个相邻汉字插空格，用正则匹配
    const disableButtons = await screen.findAllByRole("button", {
      name: /禁\s*用/,
    });
    fireEvent.click(disableButtons[0]!);

    // Modal.confirm 的确认按钮（antd v6 对两个相邻汉字插空格，用正则匹配）
    const confirmButton = await screen.findByRole("button", {
      name: /确\s*认/,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const disableCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            String(call[0]).includes(
              "/internal/model-service/admin/keys/key-1/disable",
            ) && (call[1]?.method ?? "GET") === "POST",
        );
      expect(disableCalls.length).toBe(1);
    });
    // 成功后提示并失效缓存（列表重新请求）
    expect(
      await screen.findByText("已代员工禁用该 Key"),
    ).toBeInTheDocument();
    await waitFor(() => {
      const listCalls = vi
        .mocked(fetch)
        .mock.calls.filter((call) =>
          String(call[0]).includes("/internal/model-service/admin/keys?"),
        );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("禁用态 Key 提供启用入口", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "模型服务 · 平台管理" });

    // 第二行（disabled）应为「启用」（antd v6 对两个相邻汉字插空格，用正则匹配）
    expect(
      (
        await screen.findAllByRole("button", { name: /启\s*用/ })
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("缺少全平台用量权限时仅渲染 Key 管理区", async () => {
    stubFetch((path) => {
      if (path.includes("/internal/identity/actor")) {
        return Response.json({
          departmentIds: ["dept-1"],
          employeeId: "E0001",
          permissions: ["model_service.key.manage_all"],
          primaryDepartmentId: "dept-1",
          roleCodes: ["super_admin"],
        });
      }
      return baseHandler(path);
    });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "模型服务 · 平台管理" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("平台用量（今日）")).not.toBeInTheDocument();
    expect(screen.getByText("全平台 Key")).toBeInTheDocument();
  });
});
