import { Breadcrumb } from "antd";
import { Link } from "react-router-dom";

import { ROUTES } from "../../router/routes";
import { useBreadcrumbs } from "./useBreadcrumbs";

/** 集中渲染当前路由的面包屑；首项非"应用市场"时前置应用市场入口。 */
export function Breadcrumbs() {
  const labels = useBreadcrumbs();

  if (labels.length === 0) {
    return null;
  }

  const items: Array<{ title: React.ReactNode }> = [];
  if (labels[0] !== "应用市场") {
    items.push({ title: <Link to={ROUTES.marketplace}>应用市场</Link> });
  }
  labels.forEach((label, index) => {
    const isLast = index === labels.length - 1;
    if (index === 0 && labels[0] === "应用市场" && !isLast) {
      items.push({ title: <Link to={ROUTES.marketplace}>应用市场</Link> });
    } else {
      items.push({ title: label });
    }
  });

  return (
    <nav aria-label="面包屑" className="mb-4">
      <Breadcrumb items={items} />
    </nav>
  );
}
