import { Button, Result } from "antd";
import { Link } from "react-router-dom";

import { ROUTES } from "../../router/routes";

export interface ForbiddenBlockProps {
  description?: string;
}

export function ForbiddenBlock({
  description = "您没有访问此页面的权限",
}: ForbiddenBlockProps) {
  return (
    <Result
      extra={
        <Link to={ROUTES.marketplace}>
          <Button type="primary">返回首页</Button>
        </Link>
      }
      status="403"
      subTitle={description}
      title="没有访问权限"
    />
  );
}
