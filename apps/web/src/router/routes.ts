export const ROUTES = {
  home: "/",
  login: "/login",
  marketplace: "/marketplace",
  marketplaceDetail: "/marketplace/:applicationId",
  innovation: "/innovation",
  innovationDetail: "/innovation/:demandId",
  applications: "/applications",
  applicationDetail: "/applications/:applicationId",
  applicationVersions: "/applications/:applicationId/versions",
  applicationReview: "/applications/:applicationId/review",
  applicationDelivery: "/applications/:applicationId/delivery",
  analytics: "/analytics",
  organization: "/organization",
  security: "/security",
  notifications: "/notifications",
  creator: "/creator/:applicationId",
  assistant: "/assistant",
} as const;

export interface RouteMeta {
  path: string;
  labels: readonly string[];
}

/** 面包屑路径元表：最具体的路由在前，matchPath 按序匹配。 */
export const ROUTE_META: readonly RouteMeta[] = [
  {
    labels: ["应用市场", "应用详情"],
    path: ROUTES.marketplaceDetail,
  },
  {
    labels: ["应用管理", "版本管理"],
    path: ROUTES.applicationVersions,
  },
  {
    labels: ["应用管理", "审核工作台"],
    path: ROUTES.applicationReview,
  },
  {
    labels: ["应用管理", "交付配置"],
    path: ROUTES.applicationDelivery,
  },
  {
    labels: ["应用管理", "应用详情"],
    path: ROUTES.applicationDetail,
  },
  {
    labels: ["创新广场", "需求详情"],
    path: ROUTES.innovationDetail,
  },
  {
    labels: ["创作者中心"],
    path: ROUTES.creator,
  },
  {
    labels: ["应用市场"],
    path: ROUTES.marketplace,
  },
  {
    labels: ["创新广场"],
    path: ROUTES.innovation,
  },
  {
    labels: ["应用管理"],
    path: ROUTES.applications,
  },
  {
    labels: ["数据看板"],
    path: ROUTES.analytics,
  },
  {
    labels: ["组织管理"],
    path: ROUTES.organization,
  },
  {
    labels: ["系统安全"],
    path: ROUTES.security,
  },
  {
    labels: ["站内通知"],
    path: ROUTES.notifications,
  },
  {
    labels: ["AI 助手"],
    path: ROUTES.assistant,
  },
] as const;
