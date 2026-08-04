const requiredSecrets = Object.freeze([
  "COOKIE_SECRET_FILE",
  "DB_PASSWORD_FILE",
  "DATABASE_URL_FILE",
  "GARAGE_ACCESS_KEY_FILE",
  "GARAGE_SECRET_KEY_FILE",
  "TLS_CERT_FILE",
  "TLS_KEY_FILE",
]);

const requiredImages = Object.freeze([
  "API_IMAGE",
  "WORKER_IMAGE",
  "WEB_IMAGE",
  "POSTGRES_IMAGE",
  "GARAGE_IMAGE",
  "PROXY_IMAGE",
]);

const forbiddenFallbacks =
  /(?:local|development|change[-_ ]?me|replace[-_ ]?before)/i;
const digestImage = /@sha256:[a-f0-9]{64}$/i;

export function validateProductionConfig(environment, composeText) {
  const errors = [];

  if (
    !environment.NODE_ROLE ||
    !["active", "standby"].includes(environment.NODE_ROLE)
  ) {
    errors.push("NODE_ROLE must be active or standby");
  }

  for (const key of [
    "PUBLIC_HOSTNAME",
    "PUBLIC_ORIGIN",
    "DATABASE_URL",
    ...requiredSecrets,
  ]) {
    if (!environment[key]) {
      errors.push(`${key} is required`);
    }
  }

  for (const key of requiredImages) {
    const image = environment[key];
    if (!image) {
      errors.push(`${key} is required`);
      continue;
    }
    if (!digestImage.test(image) || /:latest(?:@|$)/i.test(image)) {
      errors.push(`${key} must use a digest-pinned image, not a mutable tag`);
    }
  }

  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === "string" && forbiddenFallbacks.test(value)) {
      errors.push(`${key} contains a development or local fallback`);
    }
  }

  const forbiddenHostPorts = [
    /postgres[\s\S]{0,400}ports\s*:/i,
    /garage[\s\S]{0,400}ports\s*:/i,
  ];
  for (const pattern of forbiddenHostPorts) {
    if (pattern.test(composeText)) {
      errors.push("postgres and garage must not publish host ports");
      break;
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join("; ")}`);
  }

  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProductionConfig(process.env, "");
  console.log(JSON.stringify(result));
}
