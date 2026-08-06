import { Button, Result } from "antd";
import { Link } from "react-router-dom";

import { ROUTES } from "../../router/routes";

export interface NotFoundBlockProps {
  description?: string;
}

export function NotFoundBlock({
  description = "页面不存在或已下架",
}: NotFoundBlockProps) {
  return (
    <Result
      extra={[
        <Button key="back" onClick={() => globalThis.window.history.back()}>
          返回上一页
        </Button>,
        <Link key="home" to={ROUTES.marketplace}>
          <Button type="primary">返回首页</Button>
        </Link>,
      ]}
      status="404"
      subTitle={description}
      title="页面不存在"
    />
  );
}
