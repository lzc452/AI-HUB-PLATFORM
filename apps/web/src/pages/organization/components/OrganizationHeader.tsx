import { TeamOutlined } from "@ant-design/icons";
import { Typography } from "antd";

const { Title } = Typography;

/**
 * 页头：图标 + 标题。纯展示组件，无状态。
 *
 * 设计图为实心人物图标，但 @ant-design/icons 未导出 TeamFilled；
 * 按"没有的图标用相近已有图标代替"原则，使用 TeamOutlined 并以白色呈现。
 */
export function OrganizationHeader() {
  return (
    <div className="flex gap-3">
      <div className="flex h-22 w-22 shrink-0 items-center justify-center rounded-xl bg-[#1677ff]">
        <TeamOutlined className="text-2xl !text-white" style={{ fontSize: "54px" }} />
      </div>
      <Title className="!my-0" level={1}>
        组织管理
      </Title>
    </div>
  );
}
