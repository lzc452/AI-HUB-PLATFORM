export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  traceId: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}
