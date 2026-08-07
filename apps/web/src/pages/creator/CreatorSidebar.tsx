import {
  ApiOutlined,
  CommentOutlined,
  ExperimentOutlined,
  ReadOutlined,
  RightOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Typography } from "antd";

import {
  creatorAchievements,
  developerResources,
  publishingSuggestions,
  type DeveloperResource,
} from "./creatorMeta";

const { Title } = Typography;

const resourceIcons: Record<DeveloperResource["icon"], React.ReactNode> = {
  api: <ApiOutlined aria-hidden="true" className="text-[#1677ff]" />,
  comment: <CommentOutlined aria-hidden="true" className="text-[#52c41a]" />,
  experiment: (
    <ExperimentOutlined aria-hidden="true" className="text-[#7a5af8]" />
  ),
  read: <ReadOutlined aria-hidden="true" className="text-[#f79009]" />,
};

/** 创作者中心右侧栏：成就徽章、发布建议、开发者资源。 */
export function CreatorSidebar() {
  return (
    <aside aria-label="创作者资源" className="space-y-4">
      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
        <Title level={5} className="!mb-4 !mt-0 !text-base">
          创作者成就
        </Title>
        <ul className="m-0 space-y-3 p-2">
          {creatorAchievements.map((achievement, index) => (
            <li
              key={`${achievement.title}-${index}`}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                style={{ background: achievement.gradient }}
              >
                <TrophyOutlined />
              </span>
              <span className="text-xs text-[#1f1f1f]">
                {achievement.title}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
        <Title level={5} className="!mb-2 !mt-0 !text-base">
          发布建议
        </Title>
        <ul className="m-0 p-2">
          {publishingSuggestions.map((suggestion) => (
            <li key={suggestion}>
              <div
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-[#595959] transition-colors hover:bg-[#f0f7ff] hover:text-[#1677ff]"
              >
                <span>{suggestion}</span>
                <RightOutlined
                  aria-hidden="true"
                  className="shrink-0 text-xs text-[#8c8c8c]"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
        <Title level={5} className="!mb-2 !mt-0 !text-base">
          开发者资源
        </Title>
        <ul className="m-0 p-2">
          {developerResources.map((resource) => (
            <li key={resource.title}>
              <div
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-[#1f1f1f] transition-colors hover:bg-[#f0f7ff]"
              >
                {resourceIcons[resource.icon]}
                <span className="flex-1">{resource.title}</span>
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
