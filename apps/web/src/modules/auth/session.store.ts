export interface AuthSession {
  employeeId: string;
}

const STORAGE_KEY = "ai-hub.session";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

// 安全说明：会话令牌（sessionId）仅存于后端下发的 HttpOnly Cookie 中，绝不在前端
// 可读取的 localStorage 中持久化，避免 XSS 通过 JS 窃取会话。此处仅保留非敏感的
// employeeId，用于刷新页面时提供「可能已登录」的加载态提示（最终以服务端 /actor 为准）。
function loadSession(): AuthSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as AuthSession).employeeId === "string"
    ) {
      return { employeeId: (parsed as AuthSession).employeeId };
    }
    return null;
  } catch {
    return null;
  }
}

let currentSession: AuthSession | null = loadSession();

export function getSession(): AuthSession | null {
  return currentSession;
}

export function setSession(session: AuthSession | null): void {
  currentSession = session;
  try {
    if (session) {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage 可能不可用；会话仅保存在内存中。
  }
  for (const listener of listeners) {
    listener(currentSession);
  }
}

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
