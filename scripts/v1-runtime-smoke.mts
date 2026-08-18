import { createHash } from "node:crypto";

const baseUrl = process.env.V1_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const passwords = {
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
} as const;

type EmployeeId = keyof typeof passwords;

interface ChallengeResponse {
  keyId: string;
  jwk: JsonWebKey;
  nonce: string;
  expiresAt: string;
}

interface ActorResponse {
  actor: { employeeId: string; sessionId: string };
}

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

async function login(employeeId: EmployeeId) {
  const challengeResult = await requestJson(
    "/internal/identity/login/challenge",
  );
  if (challengeResult.status !== 200) {
    throw new Error(`LOGIN_CHALLENGE_${challengeResult.status}`);
  }
  const challenge = challengeResult.body as ChallengeResponse;
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
        employeeId,
        password: passwords[employeeId],
        deviceLabel: "v1-smoke",
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
      employeeId,
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
      `LOGIN_${employeeId}_${loginResult.status}_${JSON.stringify(loginResult.body)}`,
    );
  }
  const result = loginResult.body as ActorResponse;
  return {
    employeeId,
    sessionId: result.actor.sessionId,
    headers: {
      "content-type": "application/json",
      "x-employee-id": employeeId,
      "x-session-id": result.actor.sessionId,
    },
  };
}

async function poll(
  path: string,
  session: Awaited<ReturnType<typeof login>>,
  predicate: (body: any) => boolean,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await requestJson(path, { headers: session.headers });
    if (result.status !== 200) {
      throw new Error(
        `POLL_${path}_${result.status}_${JSON.stringify(result.body)}`,
      );
    }
    if (predicate(result.body)) return result.body;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`POLL_TIMEOUT_${path}`);
}

const session = await login("DEMO-SUPER-ADMIN");
const createdApplication = await requestJson("/internal/applications", {
  method: "POST",
  headers: session.headers,
  body: JSON.stringify({
    name: `V1 Artifact Smoke ${Date.now()}`,
    summary: "本地 V1 Artifact Intake 运行时验收应用",
    departmentId: "demo-rnd",
  }),
});
if (createdApplication.status !== 201) {
  throw new Error(
    `APPLICATION_CREATE_${createdApplication.status}_${JSON.stringify(createdApplication.body)}`,
  );
}
const applicationId = createdApplication.body.applicationId as string;
const content = Buffer.from("AI-HUB-V1-ARTIFACT-SMOKE");
const sha256 = createHash("sha256").update(content).digest("hex");
const createdUpload = await requestJson(
  `/internal/applications/${applicationId}/artifact-uploads`,
  {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify({
      fileName: "v1-smoke.txt",
      mimeType: "text/plain",
      sizeBytes: content.byteLength,
    }),
  },
);
if (createdUpload.status !== 201) {
  throw new Error(
    `UPLOAD_INIT_${createdUpload.status}_${JSON.stringify(createdUpload.body)}`,
  );
}
const uploadId = createdUpload.body.uploadId as string;
const uploadContent = await requestJson(
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
if (uploadContent.status !== 200 || uploadContent.body.sha256 !== sha256) {
  throw new Error(
    `UPLOAD_CONTENT_${uploadContent.status}_${JSON.stringify(uploadContent.body)}`,
  );
}
const queued = await requestJson(
  `/internal/applications/${applicationId}/artifact-uploads/${uploadId}/complete`,
  {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify({}),
  },
);
if (queued.status !== 200 || queued.body.uploadStatus !== "verifying") {
  throw new Error(
    `UPLOAD_COMPLETE_${queued.status}_${JSON.stringify(queued.body)}`,
  );
}
const completed = await poll(
  `/internal/applications/${applicationId}/artifact-uploads/${uploadId}`,
  appAdmin,
  (body) => body.uploadStatus === "completed" || body.uploadStatus === "failed",
);
if (
  completed.uploadStatus !== "completed" ||
  completed.scanStatus !== "passed"
) {
  throw new Error(`ARTIFACT_VERIFY_FAILED_${JSON.stringify(completed)}`);
}

const exportCreated = await requestJson("/internal/security/audit-exports", {
  method: "POST",
  headers: session.headers,
  body: JSON.stringify({ filterSnapshot: { source: "v1-runtime-smoke" } }),
});
if (exportCreated.status !== 200) {
  throw new Error(
    `EXPORT_CREATE_${exportCreated.status}_${JSON.stringify(exportCreated.body)}`,
  );
}
const exportId = exportCreated.body.exportJobId as string;
const exportStatus = await poll(
  `/internal/security/audit-exports/${exportId}`,
  session,
  (body) => body.status === "completed" || body.status === "failed",
);
if (exportStatus.status !== "completed") {
  throw new Error(`EXPORT_FAILED_${JSON.stringify(exportStatus)}`);
}
const exportDownload = await fetch(
  `${baseUrl}/internal/security/audit-exports/${exportId}/download`,
  {
    headers: session.headers,
  },
);
const exportText = await exportDownload.text();
if (exportDownload.status !== 200 || !exportText.includes("auditEventId")) {
  throw new Error(
    `EXPORT_DOWNLOAD_${exportDownload.status}_${exportText.slice(0, 200)}`,
  );
}

console.log(
  JSON.stringify(
    {
      login: {
        superAdmin: session.employeeId,
      },
      artifact: {
        applicationId,
        uploadId,
        stagingObjectKey: queued.body.stagingObjectKey ?? queued.body.objectKey,
        finalObjectKey: completed.objectKey,
        sha256,
        scanStatus: completed.scanStatus,
        uploadStatus: completed.uploadStatus,
      },
      auditExport: {
        exportId,
        status: exportStatus.status,
        downloadStatus: exportDownload.status,
        contentType: exportDownload.headers.get("content-type"),
        contentDisposition: exportDownload.headers.get("content-disposition"),
        firstLine: exportText.split("\n")[0]?.slice(0, 500),
      },
    },
    null,
    2,
  ),
);
