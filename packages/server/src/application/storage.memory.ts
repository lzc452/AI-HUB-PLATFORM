import type { ObjectStoragePort } from "./storage.port.js";

export class MemoryObjectStorage implements ObjectStoragePort {
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, content: Uint8Array): Promise<void> {
    this.objects.set(key, new Uint8Array(content));
  }

  async get(key: string): Promise<Uint8Array | null> {
    const content = this.objects.get(key);
    return content === undefined ? null : new Uint8Array(content);
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const content = this.objects.get(sourceKey);
    if (content === undefined) throw new Error("OBJECT_NOT_FOUND");
    this.objects.set(destinationKey, new Uint8Array(content));
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
