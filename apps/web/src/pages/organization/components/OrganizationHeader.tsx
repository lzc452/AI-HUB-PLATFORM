import { TeamOutlined } from "@ant-design/icons";
import { Typography } from "antd";

const { Title } = Typography;

/** 页头：图标 + 标题。纯展示组件，无状态。 */
export function OrganizationHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1677ff]">
        <TeamOutlined className="text-xl text-white" />
      </div>
      <Title className="!mb-0" level={1}>
        组织管理
      </Title>
    </div>
  );
}
