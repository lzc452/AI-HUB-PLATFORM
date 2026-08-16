export interface ApiErrorResponse {
  code: string;
  message: string;
  traceId: string;
  details?: Readonly<Record<string, unknown>>;
}
