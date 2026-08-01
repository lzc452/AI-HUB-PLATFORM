import { createServer, type Server } from "node:http";

interface MetricsSource {
  metricsText(): Promise<string>;
}

export interface WorkerMetricsListener {
  port: number;
  close(): Promise<void>;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startWorkerMetricsServer(
  metrics: MetricsSource,
  port: number,
): Promise<WorkerMetricsListener> {
  const server = createServer(async (request, response) => {
    const path = request.url?.split("?", 1)[0];
    if (request.method !== "GET" || path !== "/internal/metrics") {
      response.writeHead(404).end();
      return;
    }

    try {
      const body = await metrics.metricsText();
      response.writeHead(200, {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
      });
      response.end(body);
    } catch {
      response.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Worker metrics listener did not expose a TCP port");
  }

  return {
    port: address.port,
    close: () => closeServer(server),
  };
}
