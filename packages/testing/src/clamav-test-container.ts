import { Socket } from "node:net";
import { GenericContainer, Wait } from "testcontainers";

const CLAMD_PORT = 3310;

/**
 * 启动真实 clamd 容器供附件扫描门禁测试使用。
 *
 * 镜像与端口**必须与生产 compose.yaml 保持一致**（`clamav/clamav:1.4.5-debian`、
 * 3310）：测试用别的镜像或端口，等于验证了一个生产不存在的协议行为，
 * 门禁就失去了意义。
 *
 * 与 `startPostgresTestContainer` 同样支持 TEST_CLAMAV_HOST 外部注入，
 * 让 CI 与 compose 环境复用已在运行的 clamd，避免每次都拉起冷启动。
 */
export async function startClamAvTestContainer(): Promise<{
  host: string;
  port: number;
  stop: () => Promise<void>;
}> {
  const sharedHost = process.env.TEST_CLAMAV_HOST;
  const sharedPort = process.env.TEST_CLAMAV_PORT;

  if (sharedHost && sharedPort) {
    return {
      host: sharedHost,
      port: Number.parseInt(sharedPort, 10),
      stop: async () => undefined,
    };
  }

  const container = await new GenericContainer("clamav/clamav:1.4.5-debian")
    .withExposedPorts(CLAMD_PORT)
    // clamd 冷启动要加载病毒库，可能耗时数十秒。这里**不用日志文本**判断就绪：
    // 该镜像周期性打印 "SelfCheck: Database status OK."，任何基于日志的匹配都会
    // 在真正就绪前就返回，导致后续 INSTREAM 拿到空响应
    // （表现为 CLAMAV_INVALID_RESPONSE，且原因看起来像协议 bug 而非就绪时机）。
    // 改为直接等 TCP 端口可连接。
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(180_000);

  const started = await container.start();
  const host = started.getHost();
  const port = started.getMappedPort(CLAMD_PORT);

  // 端口监听 ≠ 病毒库加载完毕。必须等 clamd 真正能应答 nPING 才算就绪，
  // 判据与生产健康检查（clamdscan --ping）一致。
  await waitForClamAvReady(host, port);

  return {
    host,
    port,
    stop: async () => {
      await started.stop();
    },
  };
}

/**
 * 轮询 clamd 的 nPING 命令直到应答 PONG。
 *
 * nPING 是 clamd 的标准存活探测：加载完病毒库后才返回 PONG。
 */
async function waitForClamAvReady(
  host: string,
  port: number,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const pong = await pingOnce(host, port);
      if (pong) return;
      lastError = new Error("CLAMAV_NOT_READY");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `CLAMAV_STARTUP_TIMEOUT:${lastError instanceof Error ? lastError.message : "unknown"}`,
  );
}

function pingOnce(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    const finish = (matched: boolean) => {
      socket.destroy();
      resolve(matched);
    };
    socket.setTimeout(5_000, () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).toString("utf8").includes("PONG")) {
        finish(true);
      }
    });
    socket.connect(port, host, () => {
      socket.write(Buffer.from("zPING\0", "ascii"));
    });
  });
}
