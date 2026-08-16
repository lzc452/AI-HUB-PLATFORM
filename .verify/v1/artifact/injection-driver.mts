// V1 Artifact 异常注入驱动器：在隔离 API 容器内运行，驱动真实 API、Garage 与 Postgres。
// 用法：node --import tsx .verify/v1/artifact/injection-driver.mts <模式> [参数...]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import pg from "pg";

const { Pool } = pg;

const baseUrl = process.env.V1_INJECT_BASE_URL ?? "http://127.0.0.1:3000";
const outDir =
  process.env.V1_INJECT_OUT_DIR ?? "/workspace/.verify/v1/artifact";
const statePath = `${outDir}/state.json`;
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "ai-hub-inject";
const demoPasswords: Readonly<Record<string, string>> = {
  "DEMO-EMPLOYEE": "Demo-Employee-2026!",
  "DEMO-APP-ADMIN": "Demo-AppAdmin-2026!",
  "DEMO-INNOVATION": "Demo-Innovation-2026!",
  "DEMO-ORG-ADMIN": "Demo-OrgAdmin-2026!",
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
};
const employeeId = "DEMO-APP-ADMIN";
const password = demoPasswords[employeeId];

const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const s3 = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://garage:3900",
  region: process.env.OBJECT_STORAGE_REGION ?? "garage",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "",
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? "",
  },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

mkdtempSyncSafe();

function mkdtempSyncSafe() {
  mkdirSync(outDir, { recursive: true });
}

type Json = Record<string, unknown>;

const encode = (value: ArrayBuffer | Uint8Array): string =>
  Buffer.from(
    value instanceof Uint8Array ? value : new Uint8Array(value),
  ).toString("base64url");

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body: any = null;
  try {
    body = text.length === 0 ? null : JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

async function login(asEmployeeId = employeeId) {
  const loginPassword = demoPasswords[asEmployeeId] ?? password;
  const challengeResult = await requestJson(
    "/internal/identity/login/challenge",
  );
  if (challengeResult.status !== 200) {
    throw new Error(`LOGIN_CHALLENGE_${challengeResult.status}`);
  }
  const challenge = challengeResult.body as {
    keyId: string;
    jwk: JsonWebKey;
    nonce: string;
  };
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "wrapKey"],
  );
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    challenge.jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  const aad = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(challenge.keyId + challenge.nonce),
    ),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    aesKey,
    new TextEncoder().encode(
      JSON.stringify({
        employeeId: asEmployeeId,
        password: loginPassword,
        deviceLabel: "v1-inject",
      }),
    ),
  );
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, rsaKey, {
    name: "RSA-OAEP",
  });
  const loginResult = await requestJson("/internal/identity/login/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      employeeId: asEmployeeId,
      envelope: {
        encryptedPayload: encode(encryptedPayload),
        wrappedKey: encode(wrappedKey),
        iv: encode(iv),
        aad: encode(aad),
        keyId: challenge.keyId,
        nonce: challenge.nonce,
      },
    }),
  });
  if (loginResult.status !== 201) {
    throw new Error(
      `LOGIN_${loginResult.status}_${JSON.stringify(loginResult.body)}`,
    );
  }
  const result = loginResult.body as {
    actor: { employeeId: string; sessionId: string };
  };
  return {
    employeeId: asEmployeeId,
    sessionId: result.actor.sessionId,
    headers: {
      "content-type": "application/json",
      "x-employee-id": asEmployeeId,
      "x-session-id": result.actor.sessionId,
    },
  };
}

async function createApplication(session: Awaited<ReturnType<typeof login>>) {
  const result = await requestJson("/internal/applications", {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify({
      name: `V1 Artifact Inject ${Date.now()}`,
      summary: "本地 V1 Artifact 异常注入验收应用",
      departmentId: "demo-rnd",
    }),
  });
  if (result.status !== 201) {
    throw new Error(
      `APPLICATION_CREATE_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  return result.body.applicationId as string;
}

async function initUpload(
  session: Awaited<ReturnType<typeof login>>,
  applicationId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
) {
  const result = await requestJson(
    `/internal/applications/${applicationId}/artifact-uploads`,
    {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ fileName, mimeType, sizeBytes }),
    },
  );
  if (result.status !== 201) {
    throw new Error(
      `UPLOAD_INIT_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  return result.body as {
    uploadId: string;
    objectKey: string;
    uploadStatus: string;
  };
}

async function putContent(
  session: Awaited<ReturnType<typeof login>>,
  applicationId: string,
  uploadId: string,
  content: Buffer,
) {
  const result = await requestJson(
    `/internal/applications/${applicationId}/artifact-uploads/${uploadId}/content`,
    {
      method: "PUT",
      headers: {
        ...session.headers,
        "content-type": "application/octet-stream",
      },
      body: content,
    },
  );
  if (result.status !== 200) {
    throw new Error(
      `UPLOAD_CONTENT_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  return result.body as { sha256: string; uploadStatus: string };
}

async function completeUpload(
  session: Awaited<ReturnType<typeof login>>,
  applicationId: string,
  uploadId: string,
  signature = "",
) {
  return requestJson(
    `/internal/applications/${applicationId}/artifact-uploads/${uploadId}/complete`,
    {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ signature }),
    },
  );
}

async function getUpload(
  session: Awaited<ReturnType<typeof login>>,
  applicationId: string,
  uploadId: string,
) {
  return requestJson(
    `/internal/applications/${applicationId}/artifact-uploads/${uploadId}`,
    { headers: session.headers },
  );
}

async function pollUpload(
  session: Awaited<ReturnType<typeof login>>,
  applicationId: string,
  uploadId: string,
  predicate: (body: any) => boolean,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await getUpload(session, applicationId, uploadId);
    if (result.status !== 200) {
      throw new Error(`POLL_${result.status}_${JSON.stringify(result.body)}`);
    }
    if (predicate(result.body)) return result.body;
    if (Date.now() > deadline) {
      throw new Error(`POLL_TIMEOUT_${JSON.stringify(result.body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function listObjects(applicationId: string): Promise<string[]> {
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `applications/${applicationId}/`,
    }),
  );
  return (response.Contents ?? []).map((entry) => entry.Key ?? "");
}

async function listBucket(): Promise<string[]> {
  const response = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  return (response.Contents ?? []).map((entry) => entry.Key ?? "");
}

async function overwriteObject(key: string, content: Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: content }),
  );
}

async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function sql<T extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

async function collectEvidence(uploadId: string) {
  const upload = await sql<pg.QueryResultRow>(
    `select upload_status, scan_status, error_code, verification_attempts,
            sha256, signature, object_key, staging_object_key, completed_at
       from application_artifact_uploads where upload_id = $1`,
    [uploadId],
  );
  const audits = await sql<pg.QueryResultRow>(
    `select event_type, actor_employee_id, details, created_at
       from application_audit_events
      where details->>'uploadId' = $1 order by created_at asc`,
    [uploadId],
  );
  const outbox = await sql<pg.QueryResultRow>(
    `select id, event_type, status, attempts, last_error, completed_at
       from outbox_events
      where payload->'details'->>'uploadId' = $1 order by created_at asc`,
    [uploadId],
  );
  return { upload, audits, outbox };
}

function loadState(): Json {
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as Json;
  } catch {
    return {};
  }
}

function saveState(state: Json) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function saveResult(label: string, result: Json) {
  writeFileSync(
    `${outDir}/${label}.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

function printSummary(value: Json) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function normalContent(label: string): Buffer {
  return Buffer.from(`AI-HUB-V1-INJECT-${label}-${Date.now()}`, "utf8");
}

async function prepare(label: string, kind: "normal" | "eicar") {
  const session = await login();
  const applicationId = await createApplication(session);
  const content =
    kind === "eicar" ? Buffer.from(EICAR, "ascii") : normalContent(label);
  const init = await initUpload(
    session,
    applicationId,
    `${label}.txt`,
    "text/plain",
    content.byteLength,
  );
  const put = await putContent(session, applicationId, init.uploadId, content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (put.sha256 !== sha256) {
    throw new Error(`SHA_MISMATCH_${put.sha256}_${sha256}`);
  }
  const state = loadState();
  state[label] = {
    applicationId,
    uploadId: init.uploadId,
    stagingKey: init.objectKey,
    sha256,
    preparedAt: new Date().toISOString(),
  };
  saveState(state);
  printSummary({
    mode: "prepare",
    label,
    ...(state[label] as Json),
    s3Before: await listObjects(applicationId),
  });
}

async function runCompleteScenario(
  label: string,
  expectedError: string,
  signature = "",
  timeoutMs = 45_000,
) {
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) {
    throw new Error(`STATE_MISSING_${label}`);
  }
  const session = await login();
  const applicationId = prepared.applicationId as string;
  const uploadId = prepared.uploadId as string;
  const complete = await completeUpload(
    session,
    applicationId,
    uploadId,
    signature,
  );
  const final = await pollUpload(
    session,
    applicationId,
    uploadId,
    (body) =>
      body.uploadStatus === "completed" || body.uploadStatus === "failed",
    timeoutMs,
  );
  if (final.uploadStatus !== "failed" || final.errorCode !== expectedError) {
    throw new Error(`EXPECT_${expectedError}_GOT_${JSON.stringify(final)}`);
  }
  const result = {
    mode: "complete",
    label,
    applicationId,
    uploadId,
    completeStatus: complete.status,
    completeBody: complete.body,
    final,
    expectedError,
    s3After: await listObjects(applicationId),
    evidence: await collectEvidence(uploadId),
    verifiedAt: new Date().toISOString(),
  };
  saveResult(label, result);
  printSummary(result);
}

async function control() {
  const label = "control";
  await prepare(label, "normal");
  const state = loadState();
  const prepared = state[label] as Json;
  const session = await login();
  const applicationId = prepared.applicationId as string;
  const uploadId = prepared.uploadId as string;
  const complete = await completeUpload(session, applicationId, uploadId);
  if (complete.status !== 200 || complete.body.uploadStatus !== "verifying") {
    throw new Error(
      `COMPLETE_${complete.status}_${JSON.stringify(complete.body)}`,
    );
  }
  const final = await pollUpload(
    session,
    applicationId,
    uploadId,
    (body) =>
      body.uploadStatus === "completed" || body.uploadStatus === "failed",
    45_000,
  );
  if (final.uploadStatus !== "completed" || final.scanStatus !== "passed") {
    throw new Error(`CONTROL_FAILED_${JSON.stringify(final)}`);
  }
  const result = {
    mode: "control",
    label,
    applicationId,
    uploadId,
    stagingKey: prepared.stagingKey,
    final,
    s3After: await listObjects(applicationId),
    evidence: await collectEvidence(uploadId),
    verifiedAt: new Date().toISOString(),
  };
  saveResult(label, result);
  printSummary(result);
}

async function cas() {
  const label = "cas";
  await prepare(label, "normal");
  const state = loadState();
  const prepared = state[label] as Json;
  const session = await login();
  const applicationId = prepared.applicationId as string;
  const uploadId = prepared.uploadId as string;
  const [first, second] = await Promise.all([
    completeUpload(session, applicationId, uploadId),
    completeUpload(session, applicationId, uploadId),
  ]);
  const third = await completeUpload(session, applicationId, uploadId);
  const final = await pollUpload(
    session,
    applicationId,
    uploadId,
    (body) =>
      body.uploadStatus === "completed" || body.uploadStatus === "failed",
    45_000,
  );
  if (final.uploadStatus !== "completed" || final.verificationAttempts !== 1) {
    throw new Error(`CAS_FAILED_${JSON.stringify(final)}`);
  }
  const result = {
    mode: "cas",
    label,
    applicationId,
    uploadId,
    concurrent: [
      { status: first.status, body: first.body },
      { status: second.status, body: second.body },
    ],
    third: { status: third.status, body: third.body },
    final,
    s3After: await listObjects(applicationId),
    evidence: await collectEvidence(uploadId),
    verifiedAt: new Date().toISOString(),
  };
  saveResult(label, result);
  printSummary(result);
}

async function stalePrepare() {
  const label = "stale";
  await prepare(label, "normal");
  const state = loadState();
  const prepared = state[label] as Json;
  const session = await login();
  const applicationId = prepared.applicationId as string;
  const uploadId = prepared.uploadId as string;
  const complete = await completeUpload(session, applicationId, uploadId);
  if (complete.status !== 200 || complete.body.uploadStatus !== "verifying") {
    throw new Error(
      `STALE_COMPLETE_${complete.status}_${JSON.stringify(complete.body)}`,
    );
  }
  const events = await sql<pg.QueryResultRow>(
    `select id, event_type, status, attempts from outbox_events
      where payload->'details'->>'uploadId' = $1 order by created_at asc`,
    [uploadId],
  );
  state[label] = {
    ...prepared,
    completeStatus: complete.status,
    completeBody: complete.body,
    outboxEvents: events,
    preparedAt: new Date().toISOString(),
  };
  saveState(state);
  printSummary({
    mode: "stale-prepare",
    label,
    applicationId,
    uploadId,
    completeBody: complete.body,
    outboxEvents: events,
  });
}

async function stalePoll() {
  const label = "stale";
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) {
    throw new Error(`STATE_MISSING_${label}`);
  }
  const session = await login();
  const applicationId = prepared.applicationId as string;
  const uploadId = prepared.uploadId as string;
  const deadline = Date.now() + 160_000;
  let retriedComplete: { status: number; body: any } | null = null;
  let final: any = null;
  for (;;) {
    const current = await getUpload(session, applicationId, uploadId);
    if (current.status !== 200) {
      throw new Error(
        `STALE_POLL_${current.status}_${JSON.stringify(current.body)}`,
      );
    }
    if (current.body.uploadStatus === "uploading" && retriedComplete === null) {
      retriedComplete = await completeUpload(session, applicationId, uploadId);
      if (retriedComplete.status !== 200) {
        throw new Error(
          `STALE_RETRY_${retriedComplete.status}_${JSON.stringify(retriedComplete.body)}`,
        );
      }
    }
    if (
      current.body.uploadStatus === "completed" ||
      current.body.uploadStatus === "failed"
    ) {
      final = current.body;
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(`STALE_POLL_TIMEOUT_${JSON.stringify(current.body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (final.uploadStatus !== "completed" || final.verificationAttempts < 2) {
    throw new Error(`STALE_RECOVERY_FAILED_${JSON.stringify(final)}`);
  }
  const result = {
    mode: "stale",
    label,
    applicationId,
    uploadId,
    retriedComplete,
    final,
    s3After: await listObjects(applicationId),
    evidence: await collectEvidence(uploadId),
    verifiedAt: new Date().toISOString(),
  };
  saveResult(label, result);
  printSummary(result);
}

async function exportCreate(label: string, filterJson = "{}") {
  const session = await login("DEMO-SUPER-ADMIN");
  let filterSnapshot: unknown = {};
  if (filterJson.startsWith("@")) {
    filterSnapshot = JSON.parse(
      readFileSync(filterJson.slice(1), "utf8"),
    ) as unknown;
  } else {
    try {
      filterSnapshot = JSON.parse(filterJson) as unknown;
    } catch {
      filterSnapshot = filterJson;
    }
  }
  const result = await requestJson("/internal/security/audit-exports", {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify({ filterSnapshot }),
  });
  if (result.status !== 200) {
    throw new Error(
      `EXPORT_CREATE_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  const state = loadState();
  state[label] = {
    exportJobId: result.body.exportJobId as string,
    filterSnapshot,
    createdAt: new Date().toISOString(),
  };
  saveState(state);
  printSummary({ mode: "export-create", label, ...(state[label] as Json) });
}

async function collectExportEvidence(exportJobId: string) {
  const job = await sql<pg.QueryResultRow>(
    `select export_job_id, requested_by_employee_id, filter_snapshot,
            status, result_storage_key, expires_at, failure_code,
            created_at, completed_at
       from security_audit_export_jobs where export_job_id = $1`,
    [exportJobId],
  );
  const audits = await sql<pg.QueryResultRow>(
    `select action as event_type, actor_employee_id, subject, result, risk,
            details,
            created_at
       from security_audit_events
      where subject = $1 or details->>'exportJobId' = $1
      order by created_at asc`,
    [exportJobId],
  );
  const outbox = await sql<pg.QueryResultRow>(
    `select id, event_type, status, attempts, last_error, completed_at
       from outbox_events where aggregate_id = $1 order by created_at asc`,
    [exportJobId],
  );
  return { job, audits, outbox };
}

async function exportPoll(label: string, expect: string) {
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) throw new Error(`STATE_MISSING_${label}`);
  const exportJobId = prepared.exportJobId as string;
  const session = await login("DEMO-SUPER-ADMIN");
  const deadline = Date.now() + 45_000;
  let status: any = null;
  for (;;) {
    const result = await requestJson(
      `/internal/security/audit-exports/${exportJobId}`,
      { headers: session.headers },
    );
    if (result.status !== 200) {
      throw new Error(
        `EXPORT_POLL_${result.status}_${JSON.stringify(result.body)}`,
      );
    }
    if (result.body.status === "completed" || result.body.status === "failed") {
      status = result.body;
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(`EXPORT_POLL_TIMEOUT_${JSON.stringify(result.body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (status.status !== expect) {
    throw new Error(`EXPECT_${expect}_GOT_${JSON.stringify(status)}`);
  }
  const result = {
    mode: "export-poll",
    label,
    exportJobId,
    status,
    evidence: await collectExportEvidence(exportJobId),
    verifiedAt: new Date().toISOString(),
  };
  saveResult(`export-${label}`, result);
  printSummary(result);
}

async function exportDownload(label: string, expectStatus = 200) {
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) throw new Error(`STATE_MISSING_${label}`);
  const exportJobId = prepared.exportJobId as string;
  const session = await login("DEMO-SUPER-ADMIN");
  const response = await fetch(
    `${baseUrl}/internal/security/audit-exports/${exportJobId}/download`,
    { headers: session.headers },
  );
  const text = await response.text();
  let body: any = text;
  try {
    body = text.length === 0 ? null : JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  if (response.status !== expectStatus) {
    throw new Error(
      `EXPORT_DOWNLOAD_${response.status}_EXPECT_${expectStatus}_${JSON.stringify(body)}`,
    );
  }
  const result = {
    mode: "export-download",
    label,
    exportJobId,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentDisposition: response.headers.get("content-disposition"),
    body,
    verifiedAt: new Date().toISOString(),
  };
  saveResult(`download-${label}`, result);
  printSummary(result);
}

async function exportExpire(label: string) {
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) throw new Error(`STATE_MISSING_${label}`);
  const exportJobId = prepared.exportJobId as string;
  await sql(
    `update security_audit_export_jobs
        set expires_at = now() - interval '1 hour'
      where export_job_id = $1`,
    [exportJobId],
  );
  const rows = await sql<pg.QueryResultRow>(
    `select status, result_storage_key, expires_at
       from security_audit_export_jobs where export_job_id = $1`,
    [exportJobId],
  );
  printSummary({
    mode: "export-expire",
    label,
    exportJobId,
    rows,
    at: new Date().toISOString(),
  });
}

async function exportDeleteObject(label: string) {
  const state = loadState();
  const prepared = state[label] as Json | undefined;
  if (prepared === undefined) throw new Error(`STATE_MISSING_${label}`);
  const exportJobId = prepared.exportJobId as string;
  const rows = await sql<pg.QueryResultRow>(
    `select result_storage_key from security_audit_export_jobs
      where export_job_id = $1`,
    [exportJobId],
  );
  const key = rows[0]?.result_storage_key as string | undefined;
  if (key === undefined || key === null) {
    throw new Error("EXPORT_STORAGE_KEY_MISSING");
  }
  await deleteObject(key);
  printSummary({
    mode: "export-delete-object",
    label,
    exportJobId,
    deletedKey: key,
    at: new Date().toISOString(),
  });
}

async function notifList(asEmployeeId: string) {
  const session = await login(asEmployeeId);
  const result = await requestJson("/internal/notifications", {
    headers: session.headers,
  });
  if (result.status !== 200) {
    throw new Error(
      `NOTIF_LIST_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  const items = Array.isArray(result.body) ? result.body : [];
  printSummary({
    mode: "notif-list",
    employeeId: asEmployeeId,
    count: items.length,
    first: items[0] ?? null,
    at: new Date().toISOString(),
  });
}

async function notifDetail(asEmployeeId: string, notificationId: string) {
  const session = await login(asEmployeeId);
  const result = await requestJson(
    `/internal/notifications/${notificationId}`,
    { headers: session.headers },
  );
  printSummary({
    mode: "notif-detail",
    employeeId: asEmployeeId,
    notificationId,
    status: result.status,
    body: result.body,
    at: new Date().toISOString(),
  });
  if (result.status !== 200) {
    throw new Error(
      `NOTIF_DETAIL_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
}

async function notifCross(notificationId: string, expectStatus = 404) {
  const session = await login("DEMO-EMPLOYEE");
  const result = await requestJson(
    `/internal/notifications/${notificationId}`,
    { headers: session.headers },
  );
  if (result.status !== expectStatus) {
    throw new Error(
      `NOTIF_CROSS_${result.status}_EXPECT_${expectStatus}_${JSON.stringify(result.body)}`,
    );
  }
  printSummary({
    mode: "notif-cross",
    employeeId: "DEMO-EMPLOYEE",
    notificationId,
    status: result.status,
    body: result.body,
    at: new Date().toISOString(),
  });
}

async function notifLegacyFallback() {
  await sql(
    `insert into notifications (
       recipient_employee_id, event_type, aggregate_id, idempotency_key,
       message, payload, read_at, delivery_status, delivery_attempts,
       last_delivery_error, next_attempt_at
     ) values (
       'DEMO-EMPLOYEE', 'system.legacy_message', 'legacy-1',
       'legacy:payload-fallback:1', '旧版纯文本通知（无结构化 payload）',
       '{}'::jsonb, null, 'sent', 1, null, null
     )
     on conflict (idempotency_key) do nothing`,
  );
  const rows = await sql<pg.QueryResultRow>(
    `select notification_id from notifications
      where idempotency_key = 'legacy:payload-fallback:1'`,
  );
  const notificationId = rows[0]?.notification_id as string;
  const session = await login("DEMO-EMPLOYEE");
  const result = await requestJson(
    `/internal/notifications/${notificationId}`,
    { headers: session.headers },
  );
  printSummary({
    mode: "notif-legacy-fallback",
    employeeId: "DEMO-EMPLOYEE",
    notificationId,
    status: result.status,
    body: result.body,
    at: new Date().toISOString(),
  });
  if (result.status !== 200) {
    throw new Error(
      `NOTIF_LEGACY_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
}

const CATALOG_MARKERS = {
  draft: "00000000-0000-4000-8000-000000000301",
  withdrawn: "00000000-0000-4000-8000-000000000302",
  archived: "00000000-0000-4000-8000-000000000303",
  departmentRnd: "00000000-0000-4000-8000-0000000000dd",
  employeeAppAdmin: "00000000-0000-4000-8000-0000000000fb",
  departmentInnovation: "00000000-0000-4000-8000-000000000119",
} as const;

async function catalogList(asEmployeeId: string, pageSize = 100, page = 1) {
  const session = await login(asEmployeeId);
  const result = await requestJson(
    `/internal/catalog?sort=recommended&page=${page}&pageSize=${pageSize}`,
    { headers: session.headers },
  );
  if (result.status !== 200) {
    throw new Error(
      `CATALOG_LIST_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
  const ids: string[] = (result.body.items ?? []).map(
    (item: { applicationId: string }) => item.applicationId,
  );
  const markerPresence = Object.fromEntries(
    Object.entries(CATALOG_MARKERS).map(([key, value]) => [
      key,
      ids.includes(value),
    ]),
  );
  printSummary({
    mode: "catalog-list",
    employeeId: asEmployeeId,
    page,
    pageSize,
    total: result.body.total,
    returned: ids.length,
    markerPresence,
    firstIds: ids.slice(0, 5),
    at: new Date().toISOString(),
  });
}

async function catalogStability(asEmployeeId: string) {
  const session = await login(asEmployeeId);
  const ids: string[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const result = await requestJson(
      `/internal/catalog?sort=recommended&page=${page}&pageSize=100`,
      { headers: session.headers },
    );
    if (result.status !== 200) {
      throw new Error(
        `CATALOG_STABILITY_${result.status}_${JSON.stringify(result.body)}`,
      );
    }
    if (page === 1) total = result.body.total as number;
    const items = (result.body.items ?? []) as {
      applicationId: string;
    }[];
    ids.push(...items.map((item) => item.applicationId));
    if (ids.length >= total || items.length === 0) break;
  }
  const unique = new Set(ids);
  printSummary({
    mode: "catalog-stability",
    employeeId: asEmployeeId,
    total,
    collected: ids.length,
    unique: unique.size,
    noDuplicates: unique.size === ids.length,
    complete: unique.size === total,
    at: new Date().toISOString(),
  });
  if (unique.size !== total || unique.size !== ids.length) {
    throw new Error(
      `CATALOG_STABILITY_FAILED_total=${total}_collected=${ids.length}_unique=${unique.size}`,
    );
  }
}

async function catalogMarkers(asEmployeeId: string) {
  const session = await login(asEmployeeId);
  const results: Record<string, { status: number; code: string | null }> = {};
  for (const [key, applicationId] of Object.entries(CATALOG_MARKERS)) {
    const result = await requestJson(
      `/internal/catalog/${encodeURIComponent(applicationId)}`,
      { headers: session.headers },
    );
    results[key] = {
      status: result.status,
      code:
        typeof result.body === "object" && result.body !== null
          ? String((result.body as { code?: unknown }).code ?? null)
          : null,
    };
  }
  printSummary({
    mode: "catalog-markers",
    employeeId: asEmployeeId,
    results,
    at: new Date().toISOString(),
  });
}

function isoDaysAgo(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function analyticsDashboard(
  asEmployeeId: string,
  dashboardKey: string,
  days: number,
) {
  const session = await login(asEmployeeId);
  const { from, to } = isoDaysAgo(days);
  const result = await requestJson(
    `/internal/analytics/dashboards/${dashboardKey}?from=${from}&to=${to}`,
    { headers: session.headers },
  );
  const totals = new Map<string, number>();
  for (const item of result.body?.metrics ?? []) {
    totals.set(
      item.metricKey,
      (totals.get(item.metricKey) ?? 0) + Number(item.value ?? 0),
    );
  }
  printSummary({
    mode: "analytics-dashboard",
    employeeId: asEmployeeId,
    dashboardKey,
    from,
    to,
    status: result.status,
    code:
      typeof result.body === "object" && result.body !== null
        ? String((result.body as { code?: unknown }).code ?? null)
        : null,
    metricsCount: result.body?.metrics?.length ?? 0,
    metricTotals: Object.fromEntries(totals),
    at: new Date().toISOString(),
  });
  if (result.status !== 200) {
    throw new Error(
      `ANALYTICS_DASHBOARD_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
}

async function analyticsForbidden(
  asEmployeeId: string,
  dashboardKey: string,
  days: number,
) {
  const session = await login(asEmployeeId);
  const { from, to } = isoDaysAgo(days);
  const result = await requestJson(
    `/internal/analytics/dashboards/${dashboardKey}?from=${from}&to=${to}`,
    { headers: session.headers },
  );
  printSummary({
    mode: "analytics-forbidden",
    employeeId: asEmployeeId,
    dashboardKey,
    from,
    to,
    status: result.status,
    body: result.body,
    at: new Date().toISOString(),
  });
  if (result.status !== 403) {
    throw new Error(`ANALYTICS_FORBIDDEN_EXPECT_403_GOT_${result.status}`);
  }
}

async function analyticsExport(
  asEmployeeId: string,
  dashboardKey: string,
  days: number,
) {
  const session = await login(asEmployeeId);
  const { from, to } = isoDaysAgo(days);
  const result = await requestJson("/internal/analytics/exports", {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify({ target: dashboardKey, from, to }),
  });
  printSummary({
    mode: "analytics-export",
    employeeId: asEmployeeId,
    dashboardKey,
    from,
    to,
    status: result.status,
    body: result.body,
    rowCount: Array.isArray(result.body?.rows) ? result.body.rows.length : null,
    at: new Date().toISOString(),
  });
  if (result.status !== 201 && result.status !== 200) {
    throw new Error(
      `ANALYTICS_EXPORT_${result.status}_${JSON.stringify(result.body)}`,
    );
  }
}

async function analyticsInteractionEvents(applicationId: string) {
  const employee = await login("DEMO-EMPLOYEE");
  const owner = await login("DEMO-SUPER-ADMIN");
  let targetApplicationId = applicationId;
  if (targetApplicationId === "") {
    const created = await requestJson("/internal/applications", {
      method: "POST",
      headers: owner.headers,
      body: JSON.stringify({
        name: `V1 Analytics Interaction ${Date.now()}`,
        summary: "本地互动分析事件冒烟应用",
        departmentId: "demo-admin",
      }),
    });
    if (created.status !== 201) {
      throw new Error(
        `INTERACTION_APP_CREATE_${created.status}_${JSON.stringify(created.body)}`,
      );
    }
    targetApplicationId = created.body.applicationId as string;
  }
  const like = await requestJson(
    `/internal/applications/${targetApplicationId}/interactions/like`,
    { method: "POST", headers: employee.headers, body: JSON.stringify({}) },
  );
  const rating = await requestJson(
    `/internal/applications/${targetApplicationId}/interactions/rating`,
    {
      method: "POST",
      headers: employee.headers,
      body: JSON.stringify({ stars: 4 }),
    },
  );
  const comment = await requestJson(
    `/internal/applications/${targetApplicationId}/interactions/comments`,
    {
      method: "POST",
      headers: employee.headers,
      body: JSON.stringify({ body: "互动分析事件冒烟评论" }),
    },
  );
  const feedback = await requestJson(
    `/internal/applications/${targetApplicationId}/interactions/feedback`,
    {
      method: "POST",
      headers: employee.headers,
      body: JSON.stringify({ type: "bug", body: "互动分析事件冒烟反馈" }),
    },
  );
  const feedbackId =
    (feedback.body as { feedbackId?: string } | null)?.feedbackId ?? "";
  const resolved = await requestJson(
    `/internal/applications/${targetApplicationId}/interactions/feedback/${feedbackId}`,
    {
      method: "PATCH",
      headers: owner.headers,
      body: JSON.stringify({
        status: "resolved",
        resolution: "已确认并计划修复",
      }),
    },
  );
  const events = await sql<pg.QueryResultRow>(
    `select event_name, count(*)::int as n
       from analytics_behavior_events
      where event_name in (
        'application_liked', 'application_commented', 'application_rated',
        'feedback_submitted', 'feedback_resolved'
      )
      group by event_name order by event_name`,
  );
  printSummary({
    mode: "analytics-interaction-events",
    applicationId: targetApplicationId,
    likeStatus: like.status,
    ratingStatus: rating.status,
    commentStatus: comment.status,
    feedbackStatus: feedback.status,
    resolvedStatus: resolved.status,
    resolvedBody: resolved.body,
    events,
    at: new Date().toISOString(),
  });
}

const mode = process.argv[2];
const label = process.argv[3];

switch (mode) {
  case "prepare":
    if (label === undefined) throw new Error("LABEL_REQUIRED");
    await prepare(label, label === "eicar" ? "eicar" : "normal");
    break;
  case "control":
    await control();
    break;
  case "cas":
    await cas();
    break;
  case "complete-bad-sig":
    await runCompleteScenario(
      label ?? "bad-signature",
      "INVALID_SIGNATURE",
      "Zm9yZ2VkLXNpZ25hdHVyZQ",
    );
    break;
  case "complete-fault":
    await runCompleteScenario(label ?? "fault", process.argv[4] ?? "UNKNOWN");
    break;
  case "tamper-digest":
    await (async () => {
      const current = loadState();
      const prepared = current[label ?? "digest-mismatch"] as Json | undefined;
      if (prepared === undefined) throw new Error("STATE_MISSING");
      await overwriteObject(
        prepared.stagingKey as string,
        Buffer.from("TAMPERED-DIGEST-CONTENT", "utf8"),
      );
      printSummary({ mode: "tamper-digest", overwritten: prepared.stagingKey });
      await runCompleteScenario(label ?? "digest-mismatch", "DIGEST_MISMATCH");
    })();
    break;
  case "tamper-delete":
    await (async () => {
      const current = loadState();
      const prepared = current[label ?? "not-found"] as Json | undefined;
      if (prepared === undefined) throw new Error("STATE_MISSING");
      await deleteObject(prepared.stagingKey as string);
      printSummary({ mode: "tamper-delete", deleted: prepared.stagingKey });
      await runCompleteScenario(label ?? "not-found", "ARTIFACT_NOT_FOUND");
    })();
    break;
  case "stale-prepare":
    await stalePrepare();
    break;
  case "stale-poll":
    await stalePoll();
    break;
  case "bucket-list":
    printSummary({
      mode: "bucket-list",
      bucket,
      objects: await listBucket(),
      at: new Date().toISOString(),
    });
    break;
  case "export-create":
    if (label === undefined) throw new Error("LABEL_REQUIRED");
    await exportCreate(label, process.argv[4]);
    break;
  case "export-poll":
    await exportPoll(label ?? "export", process.argv[4] ?? "completed");
    break;
  case "export-download":
    await exportDownload(
      label ?? "export",
      Number.parseInt(process.argv[4] ?? "200", 10),
    );
    break;
  case "export-expire":
    await exportExpire(label ?? "export");
    break;
  case "export-delete-object":
    await exportDeleteObject(label ?? "export");
    break;
  case "notif-list":
    await notifList(label ?? "DEMO-EMPLOYEE");
    break;
  case "notif-detail":
    await notifDetail(label ?? "DEMO-EMPLOYEE", process.argv[4] ?? "");
    break;
  case "notif-cross":
    await notifCross(
      label ?? "",
      Number.parseInt(process.argv[4] ?? "404", 10),
    );
    break;
  case "notif-legacy-fallback":
    await notifLegacyFallback();
    break;
  case "catalog-list":
    await catalogList(
      label ?? "DEMO-EMPLOYEE",
      Number.parseInt(process.argv[4] ?? "100", 10),
      Number.parseInt(process.argv[5] ?? "1", 10),
    );
    break;
  case "catalog-stability":
    await catalogStability(label ?? "DEMO-EMPLOYEE");
    break;
  case "catalog-markers":
    await catalogMarkers(label ?? "DEMO-EMPLOYEE");
    break;
  case "analytics-dashboard":
    await analyticsDashboard(
      label ?? "DEMO-SUPER-ADMIN",
      process.argv[4] ?? "platform",
      Number.parseInt(process.argv[5] ?? "30", 10),
    );
    break;
  case "analytics-forbidden":
    await analyticsForbidden(
      label ?? "DEMO-EMPLOYEE",
      process.argv[4] ?? "platform",
      Number.parseInt(process.argv[5] ?? "30", 10),
    );
    break;
  case "analytics-export":
    await analyticsExport(
      label ?? "DEMO-SUPER-ADMIN",
      process.argv[4] ?? "platform",
      Number.parseInt(process.argv[5] ?? "7", 10),
    );
    break;
  case "analytics-interaction-events":
    await analyticsInteractionEvents(label ?? "");
    break;
  default:
    throw new Error(`UNKNOWN_MODE_${mode}`);
}

await pool.end();
