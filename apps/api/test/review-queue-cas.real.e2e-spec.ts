import { randomUUID } from "node:crypto";
import { createDatabase, runMigrations } from "@ai-hub/database";
import {
  KyselyApplicationRepository,
  KyselyIdentityRepository,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 审核队列完成操作的CAS 门禁（真实 PostgreSQL，P0-2）。
 *
 * 事故背景：`completeReviewQueue` 只按 `application_version_id` 更新，
 * **没有 status 条件**（对比同文件 `claimReviewQueue:1485` 有
 * `.where("status","=","available")`）。于是两个并发 approve 都能通过
 * 服务层事务外状态检查，各写一条 `application_reviews`。
 *
 * 为什么唯一约束救不了：0055 建的约束维度是
 * `(application_version_id, reviewer_employee_id)` ——两个**不同**审核员
 * 各写一条并不冲突。这正是报告里「published 事件触发两次、
 * 目录重复注册、责任人收到两条通知」的真实成因。
 *
 * 这个缺陷单测完全看不见：内存仓储的 update 不执行 where 条件，
 * 既有application.service.test.ts 的 111 条用例也无法区分有无 CAS。
 */
describe("审核队列完成的 CAS（P0-2）", () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const departmentId = `DEPT-CAS-${suffix}`;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyApplicationRepository;

  async function seedQueue(
    status: "available" | "claimed" | "completed",
    claimedBy: string | null,
  ): Promise<string> {
    // 主键列是 uuid 类型，必须用合法 uuid 而非带前缀的可读 ID。
    const versionId = randomUUID();
    // application_versions 对 applications 有外键约束，必须先建应用。
    // 用仓储方法而非裸 insert，避免手工维护依赖顺序。
    const application = await repository.createApplication({
      ownerEmployeeId: "E-OWNER",
      maintainerEmployeeId: "E-OWNER",
      departmentId,
      name: `CAS 应用-${suffix}`,
      summary: "审核并发验证",
    });
    await db
      .insertInto("application_versions")
      .values({
        application_version_id: versionId,
        application_id: application.applicationId,
        version: "v1",
        changelog: "首次提交",
        artifact_key: null,
        artifact_sha256: null,
        artifact_signature: null,
        scan_status: "passed",
        created_by_employee_id: "E-AUTHOR",
      })
      .execute();
    await repository.createReviewQueue({
      applicationId: application.applicationId,
      applicationVersionId: versionId,
      status,
      claimedByEmployeeId: claimedBy,
      claimedAt: claimedBy === null ? null : new Date(),
      slaDueAt: new Date(Date.now() + 3_600_000),
      sourceStatus: "in_review",
    });
    return versionId;
  }

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    repository = new KyselyApplicationRepository(db);
    // 部门与员工都必须先建：applications.owner_employee_id 有外键指向 employees。
    // 用 identity 仓储而非裸 insert，保证 NOT NULL 列（密码重置标记等）完整。
    const identityRepository = new KyselyIdentityRepository(db);
    await identityRepository.createDepartment({
      departmentId,
      name: `CAS 部门-${suffix}`,
      parentDepartmentId: null,
      source: "local",
    });
    for (const employeeId of [
      "E-OWNER",
      "E-AUTHOR",
      "E-REVIEWER-A",
      "E-REVIEWER-B",
    ]) {
      await identityRepository.createEmployee({
        employeeId,
        displayName: employeeId,
        primaryDepartmentId: departmentId,
        status: "active",
      });
    }
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("claimed 状态的队列可以被完成", async () => {
    const versionId = await seedQueue("claimed", "E-REVIEWER-A");
    const completed = await repository.completeReviewQueue(versionId);
    expect(completed.status).toBe("completed");
  });

  it("并发第二次完成必须失败（这是修复的核心）", async () => {
    const versionId = await seedQueue("claimed", "E-REVIEWER-A");
    // 第一个审核员完成。
    await repository.completeReviewQueue(versionId);

    // 第二个并发 approve 到达同一队列 —— 无 CAS 时它会成功，
    // 导致第二条评审记录与第二次 published 事件。
    await expect(repository.completeReviewQueue(versionId)).rejects.toThrow(
      "REVIEW_QUEUE_CLAIM_REQUIRED",
    );
  });

  it("available 状态的队列不能被跳过认领直接完成", async () => {
    // claimed → completed 是唯一合法路径。
    // 若CAS 缺失，available 也能被直接完成，等于绕过认领环节。
    const versionId = await seedQueue("available", null);
    await expect(repository.completeReviewQueue(versionId)).rejects.toThrow(
      "REVIEW_QUEUE_CLAIM_REQUIRED",
    );
  });

  it("并发双击只有一次成功", async () => {
    const versionId = await seedQueue("claimed", "E-REVIEWER-B");
    const results = await Promise.allSettled([
      repository.completeReviewQueue(versionId),
      repository.completeReviewQueue(versionId),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const row = await db
      .selectFrom("application_review_queue")
      .select("status")
      .where("application_version_id", "=", versionId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("completed");
  });
});
