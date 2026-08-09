import { Typography } from "antd";

import { useActor } from "../../modules/auth/useIdentity";

const { Paragraph, Text, Title } = Typography;

/** 创作者中心欢迎横幅：类名与市场页横幅保持一致。 */
export function CreatorWelcomeBanner() {
  const actor = useActor();

  return (
    <section
      aria-label="创作者中心欢迎"
      className="flex items-center justify-between gap-6 rounded-2xl bg-gradient-to-br from-[#e6f4ff] via-[#f0f7ff] to-[#fafcff] p-6 lg:p-8"
    >
      <div className="min-w-0 space-y-2">
        <Title level={1} className="!mb-0 !text-2xl lg:!text-3xl">
          欢迎回来！您的 AI 创新中心
        </Title>
        <Paragraph className="!mb-0" style={{ color: "#595959", fontSize: 14 }}>
          统一查找、体验与分享各部门 AI 工具
        </Paragraph>
        {actor.data ? (
          <Text style={{ color: "#8c8c8c", fontSize: 12 }}>
            工号 {actor.data.employeeId}
          </Text>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="hidden h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[#3d6bff] to-[#7c9bff] opacity-30 shadow-inner md:block lg:h-32 lg:w-32"
      />
    </section>
  );
}
