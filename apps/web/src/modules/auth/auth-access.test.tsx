import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { ActorContext } from "@ai-hub/contracts";

import { Navigation } from "../../components/layout/Navigation";
import { AuthProvider } from "./auth.context";
import { setSession } from "./session.store";
import { useAuth } from "./useAuth";

type ActorWithPermissions = ActorContext & {
  permissions: readonly string[];
};

const employeeActor: ActorWithPermissions = {
  employeeId: "E0001",
  roleCodes: ["employee"],
  permissions: [
    "application.create",
    "application.read",
    "application.update",
    "catalog.read",
    "creator.read",
    "demand.create",
    "demand.interact",
    "demand.read",
    "demand.submit",
    "demand.update",
    "identity.department.read",
    "interaction.interact",
    "notification.read",
  ],
  departmentIds: ["dept-1"],
  primaryDepartmentId: "dept-1",
  sessionId: "session-employee",
};

const superAdminActor: ActorWithPermissions = {
  employeeId: "E0002",
  roleCodes: ["employee", "super_admin"],
  permissions: ["*"],
  departmentIds: ["dept-1"],
  primaryDepartmentId: "dept-1",
  sessionId: "session-super-admin",
};

function AuthProbe() {
  const { actor, error, isAuthenticated, isLoading } = useAuth();
  return (
    <output role="status">
      {JSON.stringify({
        employeeId: actor?.employeeId ?? null,
        error,
        isAuthenticated,
        isLoading,
      })}
    </output>
  );
}

function AuthActions() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>退出登录</button>;
}

function LoginProbe() {
  const { error, login } = useAuth();
  return (
    <>
      <button onClick={() => void login("E0001", "secret-password")}>
        安全登录
      </button>
      <output aria-label="登录错误">{error ?? ""}</output>
    </>
  );
}

describe("前端权限与会话恢复", () => {
  it("加密挑战失败时不自动降级发送明文密码", async () => {
    setSession(null);
    const fetchMock = vi.fn(async () =>
      Response.json({ code: "CHALLENGE_UNAVAILABLE" }, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    );
    screen.getByRole("button", { name: "安全登录" }).click();

    await waitFor(() => {
      expect(screen.getByLabelText("登录错误")).toHaveTextContent(
        "安全登录失败",
      );
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/identity/login/challenge",
      expect.any(Object),
    );
  });

  it("在已有会话时先恢复 actor，再渲染按权限过滤的菜单", async () => {
    setSession({
      employeeId: employeeActor.employeeId,
      sessionId: employeeActor.sessionId,
    });
    const fetchMock = vi.fn(async () => Response.json(employeeActor));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/marketplace"]}>
          <AuthProbe />
          <Navigation />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent('"isLoading":true');
    expect(await screen.findByRole("status")).toHaveTextContent(
      '"employeeId":"E0001"',
    );
    expect(screen.getByRole("link", { name: /应用市场/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /应用管理/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /组织管理/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /系统安全/ }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/identity/actor",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("actor 恢复失败返回 401 时清除会话并保持未认证状态", async () => {
    setSession({
      employeeId: employeeActor.employeeId,
      sessionId: employeeActor.sessionId,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "SESSION_EXPIRED", detail: "会话已过期" },
          { status: 401 },
        ),
      ),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        '"isAuthenticated":false',
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent('"employeeId":null');
  });

  it("网络错误期间不放开任何菜单", async () => {
    setSession({
      employeeId: employeeActor.employeeId,
      sessionId: employeeActor.sessionId,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/marketplace"]}>
          <AuthProbe />
          <Navigation />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent('"isLoading":false');
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      '"isAuthenticated":true',
    );
    expect(screen.getByRole("status")).toHaveTextContent('"employeeId":null');
    expect(
      screen.queryByRole("link", { name: /应用市场/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /系统安全/ }),
    ).not.toBeInTheDocument();
  });

  it("退出后切换角色登录会重新恢复对应菜单", async () => {
    let activeActor = superAdminActor;
    setSession({
      employeeId: superAdminActor.employeeId,
      sessionId: superAdminActor.sessionId,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.includes("/internal/identity/actor")) {
          return Response.json(activeActor);
        }
        if (path.includes("/internal/identity/logout")) {
          return Response.json(undefined);
        }
        return Response.json({}, { status: 404 });
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/marketplace"]}>
          <AuthProbe />
          <AuthActions />
          <Navigation />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        '"employeeId":"E0002"',
      );
    });
    expect(screen.getByRole("link", { name: /系统安全/ })).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "退出登录" }).click();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        '"isAuthenticated":false',
      );
    });

    activeActor = employeeActor;
    await act(async () => {
      setSession({
        employeeId: employeeActor.employeeId,
        sessionId: employeeActor.sessionId,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        '"employeeId":"E0001"',
      );
    });
    expect(screen.getByRole("link", { name: /应用市场/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /系统安全/ }),
    ).not.toBeInTheDocument();
  });
});
