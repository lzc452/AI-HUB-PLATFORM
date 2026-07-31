export interface HealthSnapshot {
  status: "ok" | "degraded";
  checks: Readonly<Record<string, "up" | "down">>;
  timestamp: string;
}
