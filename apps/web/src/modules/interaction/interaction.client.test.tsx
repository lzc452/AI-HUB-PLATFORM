import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportComment } from "./interaction.client";

describe("reportComment", () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockClear();
  });

  it("向 comments/:commentId/reports 提交举报（POST + reason）", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      Response.json({ reportId: "report-1", status: "open" }),
    );

    await expect(
      reportComment("app-1", "comment-1", { reason: "包含不当内容" }),
    ).resolves.toEqual({ reportId: "report-1", status: "open" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/comments/comment-1/reports",
      expect.objectContaining({
        body: JSON.stringify({ reason: "包含不当内容" }),
        method: "POST",
      }),
    );
  });

  it("评论 ID 进行 URL 编码", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ reportId: "report-2" }));

    await reportComment("app-1", "comment/1", { reason: "不当内容" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/comments/comment%2F1/reports",
      expect.anything(),
    );
  });

  it("后端错误码透出为 ApiError", async () => {
    // test/setup.ts 的默认 fetch 桩对未匹配路径返回 404。
    await expect(
      reportComment("app-1", "missing", { reason: "不当内容" }),
    ).rejects.toMatchObject({ status: 404, code: "UNKNOWN" });
  });
});
