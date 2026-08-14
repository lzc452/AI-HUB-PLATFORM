export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  message?: string;
  detail?: string;
  traceId: string;
  details?: Readonly<Record<string, unknown>>;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}
