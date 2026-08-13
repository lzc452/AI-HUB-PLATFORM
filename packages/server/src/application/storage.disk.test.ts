import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DiskObjectStorage } from "./storage.disk.js";

let tempDirs: string[] = [];

function makeStorage() {
  const directory = mkdtempSync(join(tmpdir(), "disk-object-storage-"));
  tempDirs.push(directory);
  return new DiskObjectStorage(directory);
}

afterEach(() => {
  for (const directory of tempDirs) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirs = [];
});

const bytes = (value: string) => new TextEncoder().encode(value);

describe("DiskObjectStorage", () => {
  it("put/get/delete round-trip", async () => {
    const storage = makeStorage();
    await storage.put("applications/app-1/1.0.0.zip", bytes("content"));
    await expect(storage.get("applications/app-1/1.0.0.zip")).resolves.toEqual(
      bytes("content"),
    );
    await storage.delete("applications/app-1/1.0.0.zip");
    await expect(
      storage.get("applications/app-1/1.0.0.zip"),
    ).resolves.toBeNull();
  });

  it("copy duplicates content and keeps source", async () => {
    const storage = makeStorage();
    await storage.put("tmp/key.bin", bytes("hello"));
    await storage.copy("tmp/key.bin", "final/key.bin");
    await expect(storage.get("final/key.bin")).resolves.toEqual(bytes("hello"));
    await expect(storage.get("tmp/key.bin")).resolves.toEqual(bytes("hello"));
  });

  it("does not truncate an existing destination when copy fails", async () => {
    const storage = makeStorage();
    await storage.put("final/key.bin", bytes("existing"));

    await expect(
      storage.copy("missing/key.bin", "final/key.bin"),
    ).rejects.toThrow();
    await expect(storage.get("final/key.bin")).resolves.toEqual(
      bytes("existing"),
    );
  });

  it("rejects path traversal keys", async () => {
    const storage = makeStorage();
    for (const key of [
      "../escape.bin",
      "a/../../escape.bin",
      "..\\escape.bin",
      "/absolute.bin",
      "",
    ]) {
      await expect(storage.put(key, bytes("x"))).rejects.toThrow(
        "STORAGE_KEY_INVALID",
      );
    }
  });

  it("putStream writes bytes and openReadStream reads them back", async () => {
    const storage = makeStorage();
    const { Readable } = await import("node:stream");
    const size = await storage.putStream(
      "apps/app-1/big.zip",
      Readable.from([bytes("part1"), bytes("part2")]),
    );
    expect(size).toBe(10);
    const stream = await storage.openReadStream("apps/app-1/big.zip");
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe("part1part2");
    await expect(
      storage.openReadStream("apps/app-1/missing.zip"),
    ).resolves.toBeNull();
  });
});
