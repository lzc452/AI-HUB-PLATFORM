import {
  ApiOutlined,
  CommentOutlined,
  ExperimentOutlined,
  ReadOutlined,
  RightOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Typography } from "antd";


const { Title } = Typography;

const hotTags: string[] = [] // 热门标签，api待实现
const recentUpdates: string[] = [] // 最近更新，api待实现
const developerResources = [
  { title: "如何快速找到合适的应用？", icon: "api" },
  { title: "应用使用和权限说明", icon: "comment" },
  { title: "如何申请发布应用？", icon: "experiment" },
  { title: "常见问题解答", icon: "read" },
] as const;

type DeveloperResource = (typeof developerResources)[number];

const resourceIcons: Record<DeveloperResource["icon"], React.ReactNode> = {
  api: <ApiOutlined aria-hidden="true" className="text-[#1677ff]" />,
  comment: <CommentOutlined aria-hidden="true" className="text-[#52c41a]" />,
  experiment: (
    <ExperimentOutlined aria-hidden="true" className="text-[#7a5af8]" />
  ),
  read: <ReadOutlined aria-hidden="true" className="text-[#f79009]" />,
};

/** 市场右侧栏：热门标签、最近更新、使用指南。 */
export function MarketplaceSidebar() {
  return (
    <aside aria-label="市场资源" className="space-y-4">
      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
        <Title level={5} className="!mb-4 !mt-0 !text-base">
          热门标签
        </Title>
        <ul className="m-0 space-y-3 p-2">
          {hotTags.map((tag, index) => (
            <li
              key={`${tag}-${index}`}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                style={{ background: "linear-gradient(135deg, #3d6bff, #7c9bff)" }}>
                <TrophyOutlined />
              </span>
              <span className="text-xs text-[#1f1f1f]">
                {tag}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
        <Title level={5} className="!mb-2 !mt-0 !text-base">
          最近更新
        </Title>
        <ul className="m-0 p-2">
          {recentUpdates.map((update) => (
            <li key={update}>
              <div
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-[#595959] transition-colors hover:bg-[#f0f7ff] hover:text-[#1677ff]"
              >
                <span>{update}</span>
                <RightOutlined
                  aria-hidden="true"
                  className="shrink-0 text-xs text-[#8c8c8c]"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
        <Title level={5} className="!mb-2 !mt-0 !text-base">
          使用指南
        </Title>
        <ul className="m-0 p-2">
          {developerResources.map((resource) => (
            <li key={resource.title}>
              <div
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-[#1f1f1f] transition-colors hover:bg-[#f0f7ff]"
              >
                {resourceIcons[resource.icon]}
                <span className="flex-1 !text-xs">{resource.title}</span>
                <RightOutlined
                  aria-hidden="true"
                  className="shrink-0 text-xs text-[#8c8c8c]"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
