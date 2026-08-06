import { getSession, setSession } from "../../modules/auth/session.store";

const BASE = ""; // 同源，无需前缀

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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (session) {
    headers["x-employee-id"] = session.employeeId;
    headers["x-session-id"] = session.sessionId;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
