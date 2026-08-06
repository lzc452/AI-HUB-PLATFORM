import { matchPath, useLocation } from "react-router-dom";

import { ROUTE_META } from "../../router/routes";

/** 按当前路径匹配 ROUTE_META，返回面包屑文案；无匹配返回空数组。 */
export function useBreadcrumbs(): readonly string[] {
  const { pathname } = useLocation();

  for (const meta of ROUTE_META) {
    const match = matchPath({ path: meta.path, end: true }, pathname);
    if (match) {
      return meta.labels;
    }
  }

  return [];
}
