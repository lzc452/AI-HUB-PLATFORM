import { Typography } from "antd";

import { useActor } from "../../modules/auth/useIdentity";

const { Text, Title } = Typography;

/** 创作者中心欢迎横幅：类名与市场页横幅保持一致。 */
export function CreatorWelcomeBanner() {
  const actor = useActor();

  return (
    <section
      aria-label="创作者中心欢迎"
      className="flex items-center justify-between gap-6 rounded-xl bg-gradient-to-br from-[#e6f4ff] via-[#f0f7ff] to-[#fafcff] p-4 lg:p-4"
    >
      <div className="min-w-0 space-y-2">
        <Title level={1} className="!mt-0 !text-2xl lg:!text-3xl">
          欢迎回来！{actor.data?.displayName || "创作者"}
        </Title>
        {actor.data ? (
          <Text style={{ color: "#8c8c8c", fontSize: 12 }}>
            工号 {actor.data.employeeId}
          </Text>
        ) : null}
      </div>
    </section>
  );
}
