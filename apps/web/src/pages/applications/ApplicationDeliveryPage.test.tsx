import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Modal, message } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApplicationRecord,
  ApplicationVersionRecord,
  ApplicationWorkspace,
  DeliveryRecord,
} from "../../modules/application/application.client";
import ApplicationDeliveryPage from "./ApplicationDeliveryPage";

const hoisted = vi.hoisted(() => {
  const application: ApplicationRecord = {
    applicationId: "app-001",
    currentVersionId: null,
    departmentId: "dept-1",
    maintainerEmployeeId: "E0002",
    name: "发布闭环应用",
    ownerEmployeeId: "E0001",
    status: "draft",
    summary: "用于验证发布闭环",
  };
  const latestVersion: ApplicationVersionRecord = {
    applicationId: "app-001",
    applicationVersionId: "version-latest",
    artifactKey: "applications/app-001/artifacts/latest",
    artifactSha256: "a".repeat(64),
    artifactSignature: "signature",
    changelog: "最新版本",
    createdAt: "2026-08-12T08:00:00.000Z",
    createdByEmployeeId: "E0001",
    scanStatus: "passed",
    signed: true,
    version: "2.0.0",
  };
  const deliveries: DeliveryRecord[] = [
    {
      applicationId: "app-001",
      channel: "web",
      deliveryId: "delivery-web",
      enabled: true,
      entryUrl: "https://web.internal/app",
      minClientVersion: null,
    },
    {
      applicationId: "app-001",
      channel: "desktop",
      deliveryId: "delivery-desktop",
      enabled: false,
      entryUrl: "https://download.internal/desktop",
      minClientVersion: "1.0.0",
    },
    {
      applicationId: "app-001",
      channel: "mobile",
      deliveryId: "delivery-mobile",
      enabled: true,
      entryUrl: "https://download.internal/mobile",
      minClientVersion: "2.0.0",
    },
    {
      applicationId: "app-001",
      channel: "mini_program",
      deliveryId: "delivery-mini",
      enabled: false,
      entryUrl: "mini-program://entry",
      minClientVersion: null,
    },
  ];
  const workspace: ApplicationWorkspace = {
    application,
    applicationType: "web_app",
    assets: [],
    deliveries,
    departmentName: "研发部",
    maintainerName: "E0002",
    ownerName: "E0001",
    reviewQueue: null,
    reviews: [],
    updatedAt: "2026-08-12T08:00:00.000Z",
    versions: [latestVersion],
  };
  return {
    application,
    configure: vi.fn(async ({ channel, input }) => ({
      applicationId: "app-001",
      channel,
      deliveryId: `delivery-${channel}`,
      ...input,
      minClientVersion: input.minClientVersion ?? null,
    })),
    latestVersion,
    submitReview: vi.fn(),
    useApplicationWorkspace: vi.fn(() => ({
      data: workspace,
      error: null,
      isError: false,
      isPending: false,
    })),
    workspace,
  };
});

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: () => ({
    data: hoisted.application,
    error: null,
    isError: false,
    isPending: false,
  }),
  useApplicationWorkspace: hoisted.useApplicationWorkspace,
  useAssets: () => ({
    query: { data: [], error: null, isError: false, isPending: false },
    remove: { isPending: false, mutate: vi.fn() },
  }),
  useConfigureDelivery: () => ({
    isPending: false,
    mutateAsync: hoisted.configure,
  }),
  useSubmitApplicationReview: () => ({
    isPending: false,
    mutate: hoisted.submitReview,
  }),
  useAssetImage: () => ({ objectUrl: null, failed: false }),
  useWithdrawApplication: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useArchiveApplication: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useTransferApplicationOwner: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: () => ({
    actor: { employeeId: "E0001" },
    canAccess: () => true,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/applications/app-001/delivery"]}>
      <Routes>
        <Route
          element={<ApplicationDeliveryPage />}
          path="/applications/:applicationId/delivery"
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** 取当前最新的确认弹窗（Modal.confirm 挂在 body portal，用例间可能有残留节点）。 */
function latestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const dialog = dialogs[dialogs.length - 1];
  if (!dialog) {
    throw new Error("未找到确认弹窗");
  }
  return dialog;
}

describe("ApplicationDeliveryPage", () => {
  beforeEach(() => {
    hoisted.configure.mockClear();
    hoisted.submitReview.mockClear();
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: hoisted.workspace,
      error: null,
      isError: false,
      isPending: false,
    });
  });

  afterEach(() => {
    act(() => {
      Modal.destroyAll();
      message.destroy();
    });
  });

  it("分别维护四个渠道的草稿且只保存当前渠道", async () => {
    renderPage();

    const webInput = await screen.findByLabelText("入口地址");
    expect(webInput).toHaveValue("https://web.internal/app");
    fireEvent.change(webInput, {
      target: { value: "https://web.internal/new-entry" },
    });

    fireEvent.click(screen.getByRole("button", { name: "移动端" }));
    const mobileInput = await screen.findByLabelText("入口地址");
    expect(mobileInput).toHaveValue("https://download.internal/mobile");
    fireEvent.change(mobileInput, {
      target: { value: "https://download.internal/mobile-v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(hoisted.configure).toHaveBeenCalledWith({
        channel: "mobile",
        input: {
          enabled: true,
          entryUrl: "https://download.internal/mobile-v2",
          minClientVersion: "2.0.0",
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Web 应用" }));
    expect(await screen.findByLabelText("入口地址")).toHaveValue(
      "https://web.internal/new-entry",
    );
  });

  it("保存已启用渠道时不会隐式停用", async () => {
    renderPage();

    await screen.findByDisplayValue("https://web.internal/app");
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(hoisted.configure).toHaveBeenCalledWith({
        channel: "web",
        input: {
          enabled: true,
          entryUrl: "https://web.internal/app",
          minClientVersion: null,
        },
      }),
    );
  });

  it("已签名版本通过唯一真实入口直接提交审核，不弹确认框", async () => {
    renderPage();

    const submitButtons = await screen.findAllByRole("button", {
      name: "提交审核",
    });
    expect(submitButtons).toHaveLength(1);
    fireEvent.click(submitButtons[0]!);

    expect(hoisted.submitReview).toHaveBeenCalledWith({
      applicationVersionId: "version-latest",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("未签名版本提交审核前弹出风险确认，未勾选时确认按钮禁用", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        versions: [{ ...hoisted.latestVersion, signed: false }],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    vi.useFakeTimers();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    // antd Modal.confirm 通过 setTimeout 异步挂载确认框，推进虚拟时钟使其渲染。
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const dialog = latestDialog();
    expect(within(dialog).getByText("该制品未签名")).toBeInTheDocument();
    expect(
      within(dialog).getByText("我已知晓该制品未签名并接受风险"),
    ).toBeInTheDocument();
    // 未勾选确认前确认按钮禁用，无法提交。
    const confirmButton = within(dialog).getByRole("button", {
      name: "确认提交",
    });
    expect(confirmButton).toBeDisabled();
    expect(hoisted.submitReview).not.toHaveBeenCalled();

    // 勾选确认后经 modal.update 启用确认按钮，提交时携带 acceptUnsigned=true。
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "我已知晓该制品未签名并接受风险",
      }),
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(
      within(latestDialog()).getByRole("button", { name: "确认提交" }),
    ).toBeEnabled();
    fireEvent.click(
      within(latestDialog()).getByRole("button", { name: "确认提交" }),
    );
    expect(hoisted.submitReview).toHaveBeenCalledWith({
      applicationVersionId: "version-latest",
      acceptUnsigned: true,
    });
  });

  it("未签名版本确认弹窗取消时中止提交", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        versions: [{ ...hoisted.latestVersion, signed: false }],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    vi.useFakeTimers();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // antd 对两个汉字的按钮自动插入空格，按钮可访问名称实为「取 消」。
    fireEvent.click(
      within(latestDialog()).getByRole("button", { name: /取\s*消/ }),
    );

    expect(hoisted.submitReview).not.toHaveBeenCalled();
  });

  it("桌面端应用最新版本无制品时禁止提交并提示先上传安装包", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        applicationType: "desktop_app",
        versions: [
          { ...hoisted.latestVersion, artifactKey: null, signed: null },
        ],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "提交审核" }),
    ).toBeDisabled();
    expect(screen.getByText(/请先上传安装包/)).toBeInTheDocument();
  });

  it("移动端应用最新版本无制品时禁止提交并提示先上传安装包", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        applicationType: "mobile_app",
        versions: [
          { ...hoisted.latestVersion, artifactKey: null, signed: null },
        ],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "提交审核" }),
    ).toBeDisabled();
    expect(screen.getByText(/请先上传安装包/)).toBeInTheDocument();
  });

  it("Web 应用最新版本无制品时仍允许提交（web 不需要安装包）", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        applicationType: "web_app",
        versions: [
          { ...hoisted.latestVersion, artifactKey: null, signed: null },
        ],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "提交审核" }),
    ).toBeEnabled();
    expect(screen.queryByText(/请先上传安装包/)).not.toBeInTheDocument();
  });

  it("桌面端应用已绑定制品时允许提交审核", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        applicationType: "desktop_app",
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "提交审核" }),
    ).toBeEnabled();
  });

  it("最新版本未通过扫描时禁止提交审核", async () => {
    hoisted.useApplicationWorkspace.mockReturnValue({
      data: {
        ...hoisted.workspace,
        versions: [
          {
            ...hoisted.latestVersion,
            scanStatus: "failed",
          },
        ],
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "提交审核" }),
    ).toBeDisabled();
    expect(screen.getByText("最新版本制品校验未通过")).toBeInTheDocument();
  });
});
