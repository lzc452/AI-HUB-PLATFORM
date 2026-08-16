import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamAvMalwareScanner } from "./scanner.clamav.js";

describe("ClamAvMalwareScanner", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server === undefined) return resolve();
      server.close(() => resolve());
      server = undefined;
    });
  });

  it("resolves clean as soon as clamd returns without waiting for socket end", async () => {
    server = createServer((socket) => {
      socket.once("data", () => socket.write("stream: OK\0"));
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("PORT_UNAVAILABLE");

    await expect(
      new ClamAvMalwareScanner("127.0.0.1", address.port, 500).scan(
        Buffer.from("safe"),
      ),
    ).resolves.toBe("clean");
  });

  it("maps FOUND responses to infected", async () => {
    server = createServer((socket) => {
      socket.once("data", () =>
        socket.write("stream: Eicar-Test-Signature FOUND\0"),
      );
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("PORT_UNAVAILABLE");

    await expect(
      new ClamAvMalwareScanner("127.0.0.1", address.port, 500).scan(
        Buffer.from("bad"),
      ),
    ).resolves.toBe("infected");
  });
});
