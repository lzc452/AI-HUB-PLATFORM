import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { setSession } from "../../modules/auth/session.store";

const KEY_ITEM = {
  createdAt: "2026-10-01T02:00:00.000Z",
  disabledAt: null,
  effectiveStatus: "active",
  expiresAt: null,
  keyId: "key-1",
  lastUsedAt: "2026-10-14T01:30:00.000Z",
  limits: { dailyTokens: null, rpm: 60, tpm: null },
  name: "notebook-dev",
  prefix: "sk-aihub-abcd1234",
  status: "active",
};

const USAGE_SUMMARY = {
  byKey: [
    {
      calls: 42,
      errorCalls: 3,
      keyId: "key-1",
      keyName: "notebook-dev",
      keyStatus: "active",
      totalTokens: 96000,
    },
  ],
  byModel: [
    { calls: 42, errorCalls: 3, model: "Qwen3.5 35B A3B", totalTokens: 96000 },
  ],
  daily: [
    { calls: 42, errorCalls: 3, totalTokens: 96000, usageDate: "2026-10-14" },
  ],
  fromDate: "2026-09-15",
  range: "30d",
  toDate: "2026-10-14",
  todayPartial: false,
  totals: {
    calls: 42,
    completionTokens: 32000,
    errorCalls: 3,
    promptTokens: 64000,
    totalTokens: 96000,
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
      stream: false,
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

function baseHandler(path: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
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
  if (path.includes("/internal/model-service/keys/key-1")) {
    return Response.json(
      method === "PATCH"
        ? { ...KEY_ITEM, limits: { dailyTokens: 500000, rpm: 60, tpm: null } }
        : KEY_ITEM,
    );
  }
  if (path.includes("/internal/model-service/usage")) {
    return Response.json(USAGE_SUMMARY);
  }
  if (path.includes("/internal/model-service/calls")) {
    return Response.json(CALL_PAGE);
  }
  return Response.json({}, { status: 404 });
}

describe("Key 详情页面", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/model-service/key-1");
    setSession({ employeeId: "E0001" });
    stubFetch((path, init) => baseHandler(path, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it("渲染 Key 信息、近 30 日用量与调用明细", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "notebook-dev" }),
    ).toBeInTheDocument();
    // 基本信息：prefix + 最近使用（上海时区 09:30）
    expect(screen.getByText(/sk-aihub-abcd1234/)).toBeInTheDocument();
    expect(await screen.findByText(/09:30/)).toBeInTheDocument();
    // 近 30 日用量：42 次 / 3 失败 / 96,000 Token
    expect(await screen.findByText("近 30 日用量")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("96,000")).toBeInTheDocument();
    // 调用明细（锁定该 Key，无 Key 筛选下拉）
    expect(screen.getByText("调用明细")).toBeInTheDocument();
    expect(screen.queryByText("全部 Key")).not.toBeInTheDocument();
    expect(screen.getByText("1.2 s")).toBeInTheDocument();
  });

  it("编辑属性：保存后提交 PATCH 且空值转 null", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "notebook-dev" });

    fireEvent.click(screen.getByRole("button", { name: /编\s*辑\s*属性/ }));

    // 表单预填当前值：名称与 RPM
    const nameInput = await screen.findByLabelText("Key 名称");
    expect((nameInput as HTMLInputElement).value).toBe("notebook-dev");
    const rpmInput = screen.getByLabelText("RPM（每分钟请求数）");
    expect((rpmInput as HTMLInputElement).value).toBe("60");

    // 修改每日配额为 500000，保存
    const dailyInput = screen.getByLabelText("每日 Token 配额");
    fireEvent.change(dailyInput, { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

    await waitFor(() => {
      const patchCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            String(call[0]).includes("/internal/model-service/keys/key-1") &&
            (call[1]?.method ?? "GET") === "PATCH",
        );
      expect(patchCalls.length).toBe(1);
      const body = JSON.parse(String(patchCalls[0]?.[1]?.body ?? "{}")) as {
        dailyTokenLimit: number | null;
        name: string;
        tpmLimit: number | null;
      };
      expect(body.name).toBe("notebook-dev");
      expect(body.dailyTokenLimit).toBe(500000);
      // 未设置的上限显式传 null（= 回平台默认），不是省略
      expect(body.tpmLimit).toBeNull();
    });
  });

  it("Key 不存在时展示无权访问空态", async () => {
    stubFetch((path) => {
      if (path.includes("/internal/model-service/keys/key-1")) {
        return Response.json({}, { status: 404 });
      }
      return baseHandler(path);
    });
    render(<App />);

    // 404 同样走共享 QueryClient 默认重试（指数退避约 7s），错误态在重试耗尽后出现
    expect(
      await screen.findByText("Key 不存在或无权访问", undefined, {
        timeout: 15000,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "返回 Key 列表" }),
    ).toBeInTheDocument();
  }, 20000);
});
