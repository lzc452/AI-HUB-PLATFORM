import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createComment,
  rateApplication,
  reportComment,
} from "./interaction.client";

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

describe("rateApplication", () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockClear();
  });

  it("默认提交实名评分（displayAnonymously: false）", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ ratingId: "rating-1" }));

    await rateApplication("app-1", 4);

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/rating",
      expect.objectContaining({
        body: JSON.stringify({ stars: 4, displayAnonymously: false }),
        method: "POST",
      }),
    );
  });

  it("传入 displayAnonymously: true 时提交匿名评分", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ ratingId: "rating-1" }));

    await rateApplication("app-1", 5, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/rating",
      expect.objectContaining({
        body: JSON.stringify({ stars: 5, displayAnonymously: true }),
        method: "POST",
      }),
    );
  });
});

describe("createComment", () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockClear();
  });

  it("默认提交实名评论（displayAnonymously: false）", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ commentId: "comment-1" }));

    await createComment("app-1", { body: "很好用" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/comments",
      expect.objectContaining({
        body: JSON.stringify({
          parentCommentId: null,
          body: "很好用",
          displayAnonymously: false,
        }),
        method: "POST",
      }),
    );
  });

  it("传入 displayAnonymously: true 时提交匿名评论", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ commentId: "comment-2" }));

    await createComment("app-1", {
      body: "匿名反馈",
      displayAnonymously: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal/applications/app-1/interactions/comments",
      expect.objectContaining({
        body: JSON.stringify({
          parentCommentId: null,
          body: "匿名反馈",
          displayAnonymously: true,
        }),
        method: "POST",
      }),
    );
  });
});
