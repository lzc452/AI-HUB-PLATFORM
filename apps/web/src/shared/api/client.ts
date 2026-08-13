import { getSession, setSession } from "../../modules/auth/session.store";

const BASE = ""; // 同源，无需前缀
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: string,
    public readonly traceId?: string,
  ) {
    super(detail ?? code);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  code?: string;
  detail?: string;
  traceId?: string;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || undefined;
  }
  return undefined;
}

function createReplayNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function createApiHeaders(
  headers: HeadersInit | undefined,
  contentType: string,
  method: string = "GET",
): Record<string, string> {
  const result = Object.fromEntries(new Headers(headers).entries());
  if (!("content-type" in result)) result["Content-Type"] = contentType;
  const session = getSession();
  if (session) {
    result["x-employee-id"] = session.employeeId;
    result["x-session-id"] = session.sessionId;
  }
  if (MUTATING_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken !== undefined) result["x-csrf-token"] = csrfToken;
    result["x-request-nonce"] = createReplayNonce();
    result["x-request-timestamp"] = new Date().toISOString();
  }
  return result;
}

async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  const headers = createApiHeaders(options.headers, "application/json", method);

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: options.credentials ?? "same-origin",
    headers,
  });

  if (response.status === 401) {
    setSession(null);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body.detail,
      body.traceId,
    );
  }

  return response;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiRequest(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface ApiBlobResponse {
  blob: Blob;
  fileName: string | null;
}

/** 通过与 JSON 请求相同的认证和错误处理 seam 获取二进制响应。 */
export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<ApiBlobResponse> {
  const response = await apiRequest(path, options);
  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(
      response.headers.get("content-disposition"),
    ),
  };
}

/** 通过统一认证 seam 上传原始内容，并暴露可选进度。 */
export function apiUpload<T>(
  path: string,
  content: Blob | ArrayBuffer,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `${BASE}${path}`);
    for (const [name, value] of Object.entries(
      createApiHeaders(undefined, "application/octet-stream", "PUT"),
    )) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress !== undefined) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status === 401) setSession(null);
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as T);
        return;
      }

      let body: ErrorBody = {};
      try {
        body = JSON.parse(request.responseText) as ErrorBody;
      } catch {
        // 非 JSON 错误响应统一映射为 UNKNOWN。
      }
      reject(
        new ApiError(
          request.status,
          body.code ?? "UNKNOWN",
          body.detail,
          body.traceId,
        ),
      );
    };
    request.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", "网络请求失败"));
    request.send(content);
  });
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (value === null) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  return /filename="?([^";]+)"?/i.exec(value)?.[1]?.trim() ?? null;
}
