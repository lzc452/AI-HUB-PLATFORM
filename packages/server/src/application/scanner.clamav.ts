import { Socket } from "node:net";
import type { MalwareScannerPort } from "./storage.port.js";

/** 使用 clamd INSTREAM 协议的真实本地扫描器。 */
export class ClamAvMalwareScanner implements MalwareScannerPort {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  async scan(content: Uint8Array): Promise<"clean" | "infected"> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = (error?: Error, result?: "clean" | "infected") => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error !== undefined) reject(error);
        else resolve(result as "clean" | "infected");
      };

      socket.setTimeout(this.timeoutMs, () =>
        finish(new Error("CLAMAV_TIMEOUT")),
      );
      socket.on("error", (error) =>
        finish(new Error(`CLAMAV_UNAVAILABLE:${error.message}`)),
      );
      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        // clamd 在返回结果后会保持连接，不能等待 socket end，否则每次
        // clean/infected 都会等到超时并被误判为不可用。
        const response = Buffer.concat(chunks)
          .toString("utf8")
          .replaceAll("\0", "")
          .trim();
        if (/FOUND$/u.test(response)) finish(undefined, "infected");
        else if (/^stream: OK$/iu.test(response)) finish(undefined, "clean");
      });
      socket.on("end", () => {
        const response = Buffer.concat(chunks)
          .toString("utf8")
          .replaceAll("\0", "")
          .trim();
        if (/FOUND$/u.test(response)) finish(undefined, "infected");
        else if (/^stream: OK$/iu.test(response)) finish(undefined, "clean");
        else finish(new Error(`CLAMAV_INVALID_RESPONSE:${response}`));
      });
      socket.connect(this.port, this.host, () => {
        socket.write(Buffer.from("zINSTREAM\0", "ascii"));
        const maxChunk = 1024 * 1024;
        for (let offset = 0; offset < content.byteLength; offset += maxChunk) {
          const chunk = content.subarray(offset, offset + maxChunk);
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.byteLength, 0);
          socket.write(length);
          socket.write(chunk);
        }
        const terminator = Buffer.alloc(4);
        socket.end(terminator);
      });
    });
  }
}
