import { Typography } from "antd";

const { Title } = Typography;

/**
 * 通用页头：图标 + 标题。纯展示组件，无状态。
 * 右侧插槽可通过 right_slot 传入。
 *
 */

// 定义属性类型
interface HeaderProps {
  icon?: React.ReactNode; // 图标组件
  title: string; // 标题文本
  right_slot?: React.ReactNode; // 右侧插槽组件
}

export function Header({ icon, title, right_slot }: HeaderProps) {
  return (
    <div className="flex gap-4 items-top">
      <div className="flex h-22 w-22 shrink-0 items-center justify-center rounded-xl bg-[#1677ff]">
        {icon ? (
          <div className="text-xl !text-white" style={{ fontSize: "48px" }}>
            {icon}
          </div>
        ) : null}
      </div>
      <Title className="!my-0" level={1}>
        {title}
      </Title>
      {right_slot && <div className="ml-auto">{right_slot}</div>}
    </div>
  );
}
