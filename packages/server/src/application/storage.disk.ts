import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  promises as fs,
  readFileSync,
} from "node:fs";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ObjectStoragePort } from "./storage.port.js";
/**
 * 基于本地磁盘的对象存储适配器（V1 先行实现，S3/Garage 为后续演进项）。
 *
 * - key 做路径安全校验：拒绝空串、绝对路径、`..` 穿越与反斜杠，防止目录穿越。
 * - put 使用「临时文件 + rename」保证原子写，避免半截文件被读取。
 * - copy 使用流复制，避免大文件整体进内存。
 */
export class DiskObjectStorage implements ObjectStoragePort {
  constructor(private readonly rootDirectory: string) {
    mkdirSync(rootDirectory, { recursive: true });
  }

  private resolveKey(key: string): string {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error("STORAGE_KEY_INVALID");
    }
    if (isAbsolute(key) || key.includes("..") || key.includes("\\")) {
      throw new Error("STORAGE_KEY_INVALID");
    }
    const normalized = normalize(key);
    if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
      throw new Error("STORAGE_KEY_INVALID");
    }
    const absolute = resolve(this.rootDirectory, normalized);
    if (!absolute.startsWith(resolve(this.rootDirectory) + sep)) {
      throw new Error("STORAGE_KEY_INVALID");
    }
    return absolute;
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    const target = this.resolveKey(key);
    await fs.mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, target);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const target = this.resolveKey(key);
    try {
      return new Uint8Array(readFileSync(target));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = this.resolveKey(sourceKey);
    const destination = this.resolveKey(destinationKey);
    await fs.mkdir(dirname(destination), { recursive: true });
    await pipeline(createReadStream(source), createWriteStream(destination));
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    try {
      await fs.unlink(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  /** 流式写入（大文件上传用，避免整体进内存）；返回写入字节数。 */
  async putStream(key: string, stream: NodeJS.ReadableStream): Promise<number> {
    const target = this.resolveKey(key);
    await fs.mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    const writer = createWriteStream(temporary);
    await pipeline(stream, writer);
    await fs.rename(temporary, target);
    const stats = await fs.stat(target);
    return stats.size;
  }

  /** 打开只读流（下载用）。返回 null 表示 key 不存在。 */
  async openReadStream(
    key: string,
  ): Promise<import("node:fs").ReadStream | null> {
    const target = this.resolveKey(key);
    try {
      await fs.access(target);
    } catch {
      return null;
    }
    return createReadStream(target);
  }
}
