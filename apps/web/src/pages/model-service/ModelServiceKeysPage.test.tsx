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

const DISABLED_KEY_ITEM = {
  ...KEY_ITEM,
  disabledAt: "2026-10-10T08:00:00.000Z",
  effectiveStatus: "disabled",
  keyId: "key-2",
  name: "ci-runner",
  status: "disabled",
};

const KEY_PAGE = {
  items: [KEY_ITEM, DISABLED_KEY_ITEM],
  page: 1,
  pageSize: 20,
  total: 2,
};

const CREATED_RESULT = {
  ...KEY_ITEM,
  apiKey: "sk-aihub-PLAINTEXT1234567890",
  keyId: "key-new",
  name: "brand-new-key",
};

const ROTATED_RESULT = {
  ...KEY_ITEM,
  apiKey: "sk-aihub-ROTATED0987654321",
  keyId: "key-1-rotated",
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
  if (path.includes("/internal/model-service/keys/")) {
    // 状态变更 / 轮换（POST）
    if (path.includes("/rotate")) {
      return Response.json(ROTATED_RESULT);
    }
    return Response.json({ ...KEY_ITEM, status: "disabled" });
  }
  if (path.includes("/internal/model-service/keys")) {
    if (method === "POST") {
      return Response.json(CREATED_RESULT);
    }
    if (method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return Response.json(KEY_PAGE);
  }
  return Response.json({}, { status: 404 });
}

describe("我的 API Key 页面", () => {
  beforeEach(() => {
    globalThis.window.history.pushState(
      {},
      "",
      "/console/model-service/keys",
    );
    setSession({ employeeId: "E0001" });
    stubFetch((path, init) => baseHandler(path, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it("渲染 Key 列表与创建入口", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "我的 API Key" }),
    ).toBeInTheDocument();
    // 表格数据异步到达，先等首行渲染
    expect(await screen.findByText("notebook-dev")).toBeInTheDocument();
    expect(screen.getByText("ci-runner")).toBeInTheDocument();
    // prefix 与省略号是两个文本节点，用正则匹配（两行共用 prefix，取全部）
    expect(screen.getAllByText(/sk-aihub-abcd1234/).length).toBe(2);
    // 限额展示：RPM 60 / TPM 默认 / 日 默认
    expect(screen.getAllByText(/RPM 60/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /创\s*建\s*Key/ }),
    ).toBeInTheDocument();
  });

  it("创建 Key：提交后展示一次性明文", async () => {
    render(<App />);
    await screen.findByText("notebook-dev");

    fireEvent.click(screen.getByRole("button", { name: /创\s*建\s*Key/ }));

    // 弹窗内填写名称（aria-label 定位，避免与触发按钮文本混淆）
    const nameInput = await screen.findByLabelText("Key 名称");
    fireEvent.change(nameInput, { target: { value: "brand-new-key" } });

    // 弹窗 footer 的「创建」按钮
    const modalCreateButton = screen
      .getAllByRole("button", { name: /创\s*建/ })
      .at(-1);
    fireEvent.click(modalCreateButton!);

    await waitFor(() => {
      const postCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            String(call[0]).includes("/internal/model-service/keys") &&
            (call[1]?.method ?? "GET") === "POST",
        );
      expect(postCalls.length).toBe(1);
      const body = JSON.parse(String(postCalls[0]?.[1]?.body ?? "{}")) as {
        name: string;
      };
      expect(body.name).toBe("brand-new-key");
    });

    // 一次性明文弹窗：警示 + 明文值
    expect(
      await screen.findByText("Key 创建成功"),
    ).toBeInTheDocument();
    expect(screen.getByText(/请立即保存 API Key/)).toBeInTheDocument();
    expect(
      screen.getByText("sk-aihub-PLAINTEXT1234567890"),
    ).toBeInTheDocument();
  });

  it("禁用 Key：确认后调用禁用接口", async () => {
    render(<App />);
    await screen.findByText("notebook-dev");

    fireEvent.click(screen.getAllByRole("button", { name: /禁\s*用/ })[0]!);
    const confirmButton = await screen.findByRole("button", {
      name: /确\s*认/,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const disableCalls = vi
        .mocked(fetch)
        .mock.calls.filter((call) =>
          String(call[0]).includes("/internal/model-service/keys/key-1/disable"),
        );
      expect(disableCalls.length).toBe(1);
    });
  });

  it("删除 Key：确认后调用撤销接口", async () => {
    render(<App />);
    await screen.findByText("notebook-dev");

    fireEvent.click(screen.getAllByRole("button", { name: /删\s*除/ })[0]!);
    const confirmButton = await screen.findByRole("button", {
      name: /确\s*认/,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const deleteCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            String(call[0]).includes("/internal/model-service/keys/key-1") &&
            (call[1]?.method ?? "GET") === "DELETE",
        );
      expect(deleteCalls.length).toBe(1);
    });
  });

  it("无 Key 时展示空态与创建引导", async () => {
    stubFetch((path) => {
      if (path.includes("/internal/model-service/keys")) {
        return Response.json({ items: [], page: 1, pageSize: 20, total: 0 });
      }
      return baseHandler(path);
    });
    render(<App />);

    expect(
      await screen.findByText("暂无可用 Key，创建后即可调用网关"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /创\s*建第一个 Key/ }),
    ).toBeInTheDocument();
  });
});
