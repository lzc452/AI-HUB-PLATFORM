export interface AuthSession {
  employeeId: string;
  sessionId: string;
}

const STORAGE_KEY = "ai-hub.session";

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

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
      typeof (parsed as AuthSession).employeeId === "string" &&
      typeof (parsed as AuthSession).sessionId === "string"
    ) {
      return parsed as AuthSession;
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
    // localStorage may be unavailable; session stays in memory only.
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
