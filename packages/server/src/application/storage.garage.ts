import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ReadableObjectStoragePort } from "./storage.port.js";

/**
 * Garage 的 S3-compatible object storage adapter。
 * 该类不暴露 S3 client 给业务模块，所有 key 仍由上层 domain 约束。
 */
export class GarageObjectStorage implements ReadableObjectStoragePort {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle?: boolean;
    },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content }),
    );
  }

  async putStream(key: string, stream: NodeJS.ReadableStream): Promise<number> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      size += buffer.byteLength;
    }
    await this.put(key, Buffer.concat(chunks));
    return size;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (response.Body === undefined) return null;
      const bytes = await response.Body.transformToByteArray();
      return new Uint8Array(bytes);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return response.Body === undefined
        ? null
        : (response.Body as NodeJS.ReadableStream);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async head(
    key: string,
  ): Promise<{ sizeBytes: number; etag: string | null } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: Number(response.ContentLength ?? 0),
        etag: response.ETag ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}
