/**
 * Fixed demo-data identifier scheme.
 *
 * Every entity inserted by the expanded demo data seed MUST use an ID from this
 * object.  Deterministic IDs guarantee that multi-run seeds are idempotent
 * (ON CONFLICT … DO UPDATE / DO NOTHING keyed on these primary keys).
 *
 * ## UUID layout
 *
 *   {8-char prefix}-0000-4000-8000-{12-char suffix}
 *
 * The prefix ranges are assigned per domain so IDs stay visually scannable:
 *
 *   Prefix      Domain
 *   ──────────  ──────────────────────────
 *   00000001    applications             (20)
 *   00000002    application_versions     (20)
 *   00000003    application_deliveries   (44)
 *   00000004    application_reviews      (5)
 *   00000005    application_review_queue (5)
 *   00000006    application_audiences    (15)
 *   00000007    application_ratings      (10)
 *   00000008    application_comments     (20)
 *   00000009    application_reports      (5)
 *   0000000a    catalog_delivery_actions (32)
 *   00000010    ai_demands               (18)
 *   00000011    ai_demand_comments       (15)
 *   00000012    ai_demand_reports        (5)
 *   00000013    ai_demand_progress_updates(15)
 *   00000014    ai_demand_pilots         (5)
 *   00000020    application_audit_events (10)
 *   00000021    ai_demand_audit_events   (10)
 *   00000030    notifications            (20)
 *   00000040    analytics_behavior_events(30)
 *   00000041    analytics_audit_events     (6)
 *   00000042    analytics_export_jobs      (3)
 *
 * ## Department / employee IDs
 *
 * These are plain strings (not UUIDs) reused from the existing account seed
 * (`demo-seed.ts`).  Do NOT redefine them; import `DEMO_DEPARTMENT_DEFINITIONS`
 * and `DEMO_ACCOUNT_DEFINITIONS` if you need the full definition objects.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/** Pad a number to 12 hex characters (zero-padded, lowercase). */
const hex12 = (n: number): string => n.toString(16).padStart(12, "0");

/** Build a UUID v4-compatible string for the given prefix hex and sequence. */
const uuid = (prefix: string, seq: number): string =>
  `${prefix}-0000-4000-8000-${hex12(seq)}`;

// ── domain UUID blocks ───────────────────────────────────────────────────────

/**
 * Applications — 20 total, grouped by status.
 * Sequential IDs 1..20 with zero gaps across statuses.
 */
const appDraft = Object.freeze([
  uuid("00000001", 1),
  uuid("00000001", 2),
  uuid("00000001", 3),
]);
const appInReview = Object.freeze([
  uuid("00000001", 4),
  uuid("00000001", 5),
  uuid("00000001", 6),
]);
const appApproved = Object.freeze([uuid("00000001", 7)]);
const appPublished = Object.freeze([
  uuid("00000001", 8),
  uuid("00000001", 9),
  uuid("00000001", 10),
  uuid("00000001", 11),
  uuid("00000001", 12),
  uuid("00000001", 13),
  uuid("00000001", 14),
  uuid("00000001", 15),
  uuid("00000001", 16),
  uuid("00000001", 17),
]);
const appWithdrawn = Object.freeze([
  uuid("00000001", 18),
  uuid("00000001", 19),
]);
const appArchived = Object.freeze([uuid("00000001", 20)]);

const ALL_APPS = Object.freeze([
  ...appDraft,
  ...appInReview,
  ...appApproved,
  ...appPublished,
  ...appWithdrawn,
  ...appArchived,
]);

/* Versions (20) */
const VERSIONS = Object.freeze(
  Array.from({ length: 20 }, (_, i) => uuid("00000002", i + 1)),
);

/* Deliveries (44) */
const DELIVERIES = Object.freeze(
  Array.from({ length: 44 }, (_, i) => uuid("00000003", i + 1)),
);

/* Reviews (5) */
const REVIEWS = Object.freeze(
  Array.from({ length: 5 }, (_, i) => uuid("00000004", i + 1)),
);

/* Review queue (5) */
const REVIEW_QUEUES = Object.freeze(
  Array.from({ length: 5 }, (_, i) => uuid("00000005", i + 1)),
);

/* Audiences (15) */
const AUDIENCES = Object.freeze(
  Array.from({ length: 15 }, (_, i) => uuid("00000006", i + 1)),
);

/* Ratings (10) */
const RATINGS = Object.freeze(
  Array.from({ length: 10 }, (_, i) => uuid("00000007", i + 1)),
);

/* Application comments (20) */
const APP_COMMENTS = Object.freeze(
  Array.from({ length: 20 }, (_, i) => uuid("00000008", i + 1)),
);

/* Application reports (5) */
const APP_REPORTS = Object.freeze(
  Array.from({ length: 5 }, (_, i) => uuid("00000009", i + 1)),
);

/* Delivery actions (32) */
const DELIVERY_ACTIONS = Object.freeze(
  Array.from({ length: 32 }, (_, i) => uuid("0000000a", i + 1)),
);

/**
 * Demands — 18 total across 9 statuses.
 * Sequential IDs 1..18 with zero gaps across statuses.
 *
 *   draft×3, pending_review×2, rejected×2, published×2,
 *   in_progress×3, pilot×1, completed×2, closed×1, merged×2
 */
const demandDraft = Object.freeze([
  uuid("00000010", 1),
  uuid("00000010", 2),
  uuid("00000010", 3),
]);
const demandPendingReview = Object.freeze([
  uuid("00000010", 4),
  uuid("00000010", 5),
]);
const demandRejected = Object.freeze([
  uuid("00000010", 6),
  uuid("00000010", 7),
]);
const demandPublished = Object.freeze([
  uuid("00000010", 8),
  uuid("00000010", 9),
]);
const demandInProgress = Object.freeze([
  uuid("00000010", 10),
  uuid("00000010", 11),
  uuid("00000010", 12),
]);
const demandPilot = Object.freeze([uuid("00000010", 13)]);
const demandCompleted = Object.freeze([
  uuid("00000010", 14),
  uuid("00000010", 15),
]);
const demandClosed = Object.freeze([uuid("00000010", 16)]);
const demandMerged = Object.freeze([
  uuid("00000010", 17),
  uuid("00000010", 18),
]);

const DEMAND_ALL = Object.freeze([
  ...demandDraft,
  ...demandPendingReview,
  ...demandRejected,
  ...demandPublished,
  ...demandInProgress,
  ...demandPilot,
  ...demandCompleted,
  ...demandClosed,
  ...demandMerged,
]);

/* Demand comments (15) */
const DEMAND_COMMENTS = Object.freeze(
  Array.from({ length: 15 }, (_, i) => uuid("00000011", i + 1)),
);

/* Demand reports (5) */
const DEMAND_REPORTS = Object.freeze(
  Array.from({ length: 5 }, (_, i) => uuid("00000012", i + 1)),
);

/* Demand progress updates (15) */
const DEMAND_PROGRESS = Object.freeze(
  Array.from({ length: 15 }, (_, i) => uuid("00000013", i + 1)),
);

/* Demand pilots (5) */
const DEMAND_PILOTS = Object.freeze(
  Array.from({ length: 5 }, (_, i) => uuid("00000014", i + 1)),
);

/* Application audit events (10) */
const APP_AUDIT_EVENTS = Object.freeze(
  Array.from({ length: 10 }, (_, i) => uuid("00000020", i + 1)),
);

/* Demand audit events (10) */
const DEMAND_AUDIT_EVENTS = Object.freeze(
  Array.from({ length: 10 }, (_, i) => uuid("00000021", i + 1)),
);

/* Notifications (20) */
const NOTIFICATIONS = Object.freeze(
  Array.from({ length: 20 }, (_, i) => uuid("00000030", i + 1)),
);

/* Behavior events (30) */
const BEHAVIOR_EVENTS = Object.freeze(
  Array.from({ length: 30 }, (_, i) => uuid("00000040", i + 1)),
);

/* Analytics audit events (6) */
const ANALYTICS_AUDIT_EVENTS = Object.freeze(
  Array.from({ length: 6 }, (_, i) => uuid("00000041", i + 1)),
);

/* Analytics export jobs (3) */
const ANALYTICS_EXPORT_JOBS = Object.freeze(
  Array.from({ length: 3 }, (_, i) => uuid("00000042", i + 1)),
);

/** Analytics metric keys (12).  String keys used in daily aggregates. */
const ANALYTICS_METRIC_KEYS = Object.freeze([
  "app_views",
  "app_likes",
  "app_ratings",
  "app_comments",
  "app_delivery_actions",
  "demand_created",
  "demand_published",
  "demand_completed",
  "demand_likes",
  "demand_comments",
  "active_users",
  "total_events",
] as const);

/** Analytics audience scope keys (3). */
const ANALYTICS_SCOPE_KEYS = Object.freeze([
  "global",
  "department",
  "employee",
] as const);

// ── catalog string IDs (non-UUID primary keys) ───────────────────────────────

/** Catalog categories (5).  String PK — not UUIDs. */
const CATEGORIES = Object.freeze({
  productivity: "productivity",
  ai: "ai",
  reporting: "reporting",
  collaboration: "collaboration",
  automation: "automation",
} as const);

/** Catalog tags (8).  String PK — not UUIDs. */
const TAGS = Object.freeze({
  ai: "ai",
  attendance: "attendance",
  productivity: "productivity",
  reporting: "reporting",
  collaboration: "collaboration",
  automation: "automation",
  security: "security",
  mobile: "mobile",
} as const);

// ── department / employee string IDs (reuse existing demo-seed.ts values) ────

const DEPARTMENTS = Object.freeze({
  company: "demo-company",
  rnd: "demo-rnd",
  innovation: "demo-innovation",
  admin: "demo-admin",
} as const);

const EMPLOYEES = Object.freeze({
  employee: "DEMO-EMPLOYEE",
  appAdmin: "DEMO-APP-ADMIN",
  innovation: "DEMO-INNOVATION",
  orgAdmin: "DEMO-ORG-ADMIN",
  superAdmin: "DEMO-SUPER-ADMIN",
} as const);

// ── exported IDS object ─────────────────────────────────────────────────────

/**
 * Frozen ID registry for every demo-data entity.
 *
 * ## Access patterns
 *
 * ```ts
 * // Applications by status
 * IDS.application.draft          // readonly string[]  (3 UUIDs)
 * IDS.application.published[0]   // first published app UUID
 *
 * // Versions & deliveries
 * IDS.version[4]                 // 5th version UUID
 * IDS.delivery[10]               // 11th delivery UUID
 *
 * // Demands by status
 * IDS.demand.draft               // readonly string[]  (2 UUIDs)
 * IDS.demand.merged[0]           // first merged demand UUID
 *
 * // Interaction IDs
 * IDS.rating[0]                  // first rating UUID
 * IDS.appComment[3]              // 4th application comment UUID
 * IDS.demandPilot[0]             // first demand pilot UUID
 *
 * // Catalog string IDs
 * IDS.catalog.category.ai        // "ai"
 * IDS.catalog.tag.mobile         // "mobile"
 *
 * // Departments & employees (reused from demo-seed.ts)
 * IDS.department.rnd             // "demo-rnd"
 * IDS.employee.appAdmin          // "DEMO-APP-ADMIN"
 * ```
 */
export const IDS = Object.freeze({
  application: Object.freeze({
    draft: appDraft,
    inReview: appInReview,
    approved: appApproved,
    published: appPublished,
    withdrawn: appWithdrawn,
    archived: appArchived,
    /** All 20 application UUIDs in sequential status-group order. */
    all: ALL_APPS,
  }),

  /** 20 version UUIDs (index 0..19). */
  version: VERSIONS,

  /** 44 delivery UUIDs (index 0..43). */
  delivery: DELIVERIES,

  /** 5 review UUIDs (index 0..4). */
  review: REVIEWS,

  /** 5 review-queue UUIDs (index 0..4). */
  reviewQueue: REVIEW_QUEUES,

  /** 15 audience UUIDs (index 0..14). */
  audience: AUDIENCES,

  /** 10 rating UUIDs (index 0..9). */
  rating: RATINGS,

  /** 20 application comment UUIDs (index 0..19). */
  appComment: APP_COMMENTS,

  /** 5 application report UUIDs (index 0..4). */
  appReport: APP_REPORTS,

  /** 32 delivery-action UUIDs (index 0..31). */
  deliveryAction: DELIVERY_ACTIONS,

  demand: Object.freeze({
    draft: demandDraft,
    pendingReview: demandPendingReview,
    rejected: demandRejected,
    published: demandPublished,
    inProgress: demandInProgress,
    pilot: demandPilot,
    completed: demandCompleted,
    closed: demandClosed,
    merged: demandMerged,
    /** All 18 demand UUIDs in sequential status-group order. */
    all: DEMAND_ALL,
  }),

  /** 15 demand comment UUIDs (index 0..14). */
  demandComment: DEMAND_COMMENTS,

  /** 5 demand report UUIDs (index 0..4). */
  demandReport: DEMAND_REPORTS,

  /** 15 demand progress-update UUIDs (index 0..14). */
  demandProgress: DEMAND_PROGRESS,

  /** 5 demand pilot UUIDs (index 0..4). */
  demandPilot: DEMAND_PILOTS,

  /** 10 application audit-event UUIDs (index 0..9). */
  appAuditEvent: APP_AUDIT_EVENTS,

  /** 10 demand audit-event UUIDs (index 0..9). */
  demandAuditEvent: DEMAND_AUDIT_EVENTS,

  /** 20 notification UUIDs (index 0..19). */
  notification: NOTIFICATIONS,

  /** 30 behavior-event UUIDs (index 0..29). */
  behaviorEvent: BEHAVIOR_EVENTS,

  /** 6 analytics audit-event UUIDs (index 0..5). */
  analyticsAuditEvent: ANALYTICS_AUDIT_EVENTS,

  /** 3 analytics export-job UUIDs (index 0..2). */
  analyticsExportJob: ANALYTICS_EXPORT_JOBS,

  /** 12 analytics metric keys. */
  analyticsMetric: ANALYTICS_METRIC_KEYS,

  /** 3 analytics audience scope keys. */
  analyticsScope: ANALYTICS_SCOPE_KEYS,

  catalog: Object.freeze({
    category: CATEGORIES,
    tag: TAGS,
  }),

  department: DEPARTMENTS,
  employee: EMPLOYEES,
});
