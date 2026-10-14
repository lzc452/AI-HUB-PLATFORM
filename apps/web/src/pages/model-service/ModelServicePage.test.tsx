import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { setSession } from "../../modules/auth/session.store";

const USAGE_SUMMARY = {
  byKey: [
    {
      calls: 12,
      errorCalls: 1,
      keyId: "key-1",
      keyName: "notebook-dev",
      keyStatus: "active",
      totalTokens: 48000,
    },
  ],
  byModel: [
    {
      calls: 12,
      errorCalls: 1,
      model: "Qwen3.5 35B A3B",
      totalTokens: 48000,
    },
  ],
  daily: [
    { calls: 12, errorCalls: 1, totalTokens: 48000, usageDate: "2026-10-14" },
  ],
  fromDate: "2026-10-14",
  range: "today",
  toDate: "2026-10-14",
  todayPartial: false,
  totals: {
    calls: 12,
    completionTokens: 16000,
    errorCalls: 1,
    promptTokens: 32000,
    totalTokens: 48000,
  },
};

const CALL_PAGE = {
  items: [
    {
      callId: "call-1",
      completionTokens: 800,
      durationMs: 1240,
      employeeId: "E0001",
      endpoint: "chat_completions",
      errorCode: null,
      keyId: "key-1",
      model: "Qwen3.5 35B A3B",
      promptTokens: 1600,
      requestedAt: "2026-10-14T09:30:00.000Z",
      statusCode: 200,
      stream: true,
      totalTokens: 2400,
      traceId: null,
      usageEstimated: false,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
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
  if (path.includes("/internal/model-service/usage")) {
    return Response.json(USAGE_SUMMARY);
  }
  if (path.includes("/internal/model-service/calls")) {
    return Response.json(CALL_PAGE);
  }
  return Response.json({}, { status: 404 });
}

describe("模型服务用量看板页面", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/model-service");
    setSession({ employeeId: "E0001" });
    stubFetch((path) => baseHandler(path));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it("渲染汇总指标、构成表与调用明细", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "模型服务" }),
    ).toBeInTheDocument();
    // Token 合计 48,000 同时出现在 KPI 与两张构成表（按模型/按 Key）；
    // 标题为静态渲染，数字需等数据到达，故用 findAll 等待
    expect(await screen.findAllByText("48,000")).toHaveLength(3);
    expect(screen.getByText("输入 Token")).toBeInTheDocument();
    expect(screen.getByText("调用明细")).toBeInTheDocument();
    // 模型名出现在「按模型构成」与「调用明细」两处
    expect(
      screen.getAllByText("Qwen3.5 35B A3B").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("notebook-dev")).toBeInTheDocument();
    expect(screen.getByText("1.2 s")).toBeInTheDocument();
    // 200 状态渲染为绿色 Tag（499 客户端断流有单独文案，此处不出现）
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("当日实时兜底时提示数据口径", async () => {
    stubFetch((path) =>
      path.includes("/internal/model-service/usage")
        ? Response.json({ ...USAGE_SUMMARY, todayPartial: true })
        : baseHandler(path),
    );
    render(<App />);

    expect(await screen.findByText(/当日数据为实时统计/)).toBeInTheDocument();
  });

  it("区间无调用时显示空态", async () => {
    const emptySummary = {
      ...USAGE_SUMMARY,
      byKey: [],
      byModel: [],
      daily: [],
      totals: {
        calls: 0,
        completionTokens: 0,
        errorCalls: 0,
        promptTokens: 0,
        totalTokens: 0,
      },
    };
    stubFetch((path) =>
      path.includes("/internal/model-service/usage")
        ? Response.json(emptySummary)
        : baseHandler(path),
    );
    render(<App />);

    expect(await screen.findByText("今日内暂无调用记录")).toBeInTheDocument();
  });

  it("加载失败时展示重试入口", async () => {
    stubFetch((path) =>
      path.includes("/internal/model-service/usage")
        ? Response.json({}, { status: 500 })
        : baseHandler(path),
    );
    render(<App />);

    // 共享 QueryClient 默认重试 3 次（指数退避约 7s），错误态在重试耗尽后才出现
    expect(
      await screen.findByText("用量数据加载失败", undefined, {
        timeout: 15000,
      }),
    ).toBeInTheDocument();
    // antd v6 Button 对两个相邻汉字自动插入空格（「重试」→「重 试」），用正则匹配
    expect(screen.getByRole("button", { name: /重\s*试/ })).toBeInTheDocument();
  }, 20000);

  it("切换区间后按新区间重新查询", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "模型服务" });

    fireEvent.click(screen.getByRole("button", { name: "近 7 日" }));

    await waitFor(() => {
      const usageCalls = vi
        .mocked(fetch)
        .mock.calls.map((call) => String(call[0]))
        .filter((path) => path.includes("/internal/model-service/usage"));
      expect(usageCalls.some((path) => path.includes("range=7d"))).toBe(true);
    });
  });

  it("缺少个人用量权限时引导至平台管理", async () => {
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
      await screen.findByText(
        "您没有个人用量查看权限。如需查看全平台用量，请使用平台管理页面。",
      ),
    ).toBeInTheDocument();
  });
});
