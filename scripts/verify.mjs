import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const verificationCommands = Object.freeze([
  "pnpm format:check",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm boundaries",
  "pnpm test",
  "pnpm test:input-validation",
  "pnpm build",
  "node scripts/verify-doc-links.mjs",
  "node scripts/repository-governance.mjs",
  "docker compose -f compose.yaml -f compose.test.yaml config --quiet",
]);

/**
 * 需要真实 PostgreSQL 的套件。
 *
 * 之所以与上面的静态清单分开：这些套件依赖 testcontainers 起真实容器，
 * 而 verify 必须能在**没有 Docker 的环境**里跑完前10 条静态门禁——
 * 否则一次环境缺失会把整条验证链断掉，开发者只能选择跳过整个 verify。
 *
 * 权衡是明确的：真实依赖套件**默认必须执行**（这是本次改动的目的——
 * 长期不跑正是 `application_reviewer` 那类授权缺陷长期隐身的根本原因）。
 * 只有在明确检测不到容器运行时才降级跳过，且会在stderr 留下可见提示，
 * 不做静默吞掉。CI 必须提供数据库（见 verify.yml 的 postgres service）。
 */
export const containerBackedCommands = Object.freeze(["pnpm test:api-data"]);

/**
 * 探测容器运行时是否可用。
 *
 * 优先看 CI 显式注入的 TEST_DATABASE_URL——有它就说明外部数据库已就绪，
 * 不需要本地 Docker。同时探测 docker CLI 与 docker daemon，
 * 因为「装了 docker 命令但daemon 没起」是常见状态，只查命令存在会误判。
 */
export function detectContainerRuntime(run = spawnSync) {
  if (process.env.TEST_DATABASE_URL) {
    return { available: true, reason: "TEST_DATABASE_URL 已注入" };
  }
  const cli = run("docker version --format {{.Server.Version}}", {
    shell: true,
    stdio: "ignore",
  });
  if (cli.status !== 0) {
    return { available: false, reason: "docker daemon 不可用" };
  }
  return { available: true, reason: "docker daemon 可用" };
}

export function runVerification(run = spawnSync, options = {}) {
  const probe = options.probe ?? detectContainerRuntime(run);
  for (const command of verificationCommands) {
    const result = run(command, {
      shell: true,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  if (!probe.available) {
    process.stderr.write(
      `\n[verify] 已跳过真实依赖套件：${probe.reason}。\n` +
        `[verify] 涉及 ${containerBackedCommands.join("、")}。\n` +
        `[verify] 这类套件只能检出单元测试看不见的缺陷（真实 SQL、事务、授权落库），\n` +
        `[verify] 请安装 Docker 或设置 TEST_DATABASE_URL 后重新运行。\n`,
    );
    return 0;
  }

  process.stdout.write(`\n[verify] 真实依赖套件启用（${probe.reason}）\n`);
  for (const command of containerBackedCommands) {
    const result = run(command, {
      shell: true,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runVerification();
}
