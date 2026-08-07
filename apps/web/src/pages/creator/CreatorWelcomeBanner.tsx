import { BarChartOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";

import { useActor } from "../../modules/auth/useIdentity";

const { Paragraph, Text, Title } = Typography;

/** 创作者中心欢迎横幅：类名与市场页横幅保持一致。 */
export function CreatorWelcomeBanner() {
  const navigate = useNavigate();
  const actor = useActor();

  return (
    <section
      aria-label="创作者中心欢迎"
      className="flex items-center justify-between gap-6 rounded-2xl border border-[#d6e4ff] bg-gradient-to-br from-[#e6f4ff] via-[#f0f7ff] to-[#fafcff] p-6 lg:p-8"
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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            icon={<PlusOutlined aria-hidden="true" />}
            onClick={() => navigate("/applications")}
            type="primary"
          >
            创建新应用
          </Button>
          <Button
            className="shadow-sm"
            icon={<BarChartOutlined aria-hidden="true" />}
            onClick={() => navigate("/analytics")}
            style={{
              background: "linear-gradient(135deg, #f79009, #ffc53d)",
              borderColor: "transparent",
              borderRadius: 9999,
              color: "#fff",
            }}
          >
            查看我的应用数据
          </Button>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="hidden h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[#3d6bff] to-[#7c9bff] opacity-30 shadow-inner md:block lg:h-32 lg:w-32"
      />
    </section>
  );
}
