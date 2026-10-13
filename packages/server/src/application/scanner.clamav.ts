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
        // 零字节响应说明 clamd 在给出结论前就断开了连接（过载、崩溃、
        // 或病毒库不可用）。这属于「扫描器不可用」而非「协议被破坏」——
        // 两者混为一谈会让运维把服务故障误判成代码缺陷。
        else if (response.length === 0)
          finish(new Error("CLAMAV_UNAVAILABLE:连接在返回结论前关闭"));
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
        // 终止块必须用 write 而不是 end：
        // `socket.end(data)` 在发完数据后会关闭写侧（发送 FIN），
        // clamd 把 FIN 视为流的结束，于是直接回空响应并关闭连接——
        // 表现为 CLAMAV_INVALID_RESPONSE（响应为空字符串），
        // 看起来像协议实现错误，实际是过早半关闭。
        // 保持连接打开以读取 `stream: OK` / `... FOUND` 应答，
        // 应答读到的同时再由上面的 data/end 处理里finish。
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });
    });
  }
}
