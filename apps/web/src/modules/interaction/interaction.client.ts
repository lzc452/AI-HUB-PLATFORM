import { apiFetch } from "../../shared/api/client";

function interactionsPath(applicationId: string): string {
  return `/internal/applications/${encodeURIComponent(applicationId)}/interactions`;
}

export function toggleLike(applicationId: string): Promise<unknown> {
  return apiFetch<unknown>(`${interactionsPath(applicationId)}/like`, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function rateApplication(
  applicationId: string,
  stars: number,
): Promise<unknown> {
  return apiFetch<unknown>(`${interactionsPath(applicationId)}/rating`, {
    body: JSON.stringify({ stars }),
    method: "POST",
  });
}
