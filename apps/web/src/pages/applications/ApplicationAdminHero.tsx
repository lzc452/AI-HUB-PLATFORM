import { PlusOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";
import type { CSSProperties, ReactNode } from "react";

const { Title, Paragraph } = Typography;

export interface ApplicationAdminHeroProps {
  description: string;
  onCreate?: () => void;
  title: string;
}

/**
 * 应用管理 Hero：浅蓝渐变 + 等距几何插画 + 主操作按钮。
 * 视觉与 marketplace 一致：rounded-2xl + 浅蓝渐变 + 等距方块装饰。
 */
export function ApplicationAdminHero({
  description,
  onCreate,
  title,
}: ApplicationAdminHeroProps) {
  return (
    <section
      aria-label="应用管理概览"
      className="relative isolate flex flex-col items-stretch gap-4 overflow-hidden rounded-2xl border border-[#d6e4ff] bg-gradient-to-br from-[#e6f4ff] via-[#f0f7ff] to-[#fafcff] p-4 sm:p-6 lg:flex-row lg:items-center lg:gap-6"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Title
          className="!mb-0 !text-2xl !font-semibold !leading-tight !text-[#1f1f1f] lg:!text-[28px]"
          level={1}
        >
          {title}
        </Title>
        <Paragraph className="!mb-0 text-sm !text-[#595959] lg:text-base">
          {description}
        </Paragraph>
      </div>

      <div aria-hidden="true" className="hidden shrink-0 lg:block">
        <HeroGeometry />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Button
          aria-label="创建应用"
          className="!h-10 !rounded-lg !px-5 !text-sm !font-medium"
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={onCreate}
          style={createButtonStyle}
          type="primary"
        >
          创建应用
        </Button>
      </div>
    </section>
  );
}

const createButtonStyle: CSSProperties = {
  background: "linear-gradient(135deg, #2f6bff 0%, #4f8bff 100%)",
  border: "none",
  boxShadow: "0 6px 20px -8px rgba(47, 107, 255, 0.55)",
};

function HeroGeometry(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="88"
      role="presentation"
      viewBox="0 0 240 88"
      width="240"
    >
      <defs>
        <linearGradient id="heroCubeA" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#b9d5ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#6f9bff" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="heroCubeB" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#dfeaff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#9fbfff" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="heroCubeC" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#cfdffe" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <g opacity="0.95" transform="translate(0,12)">
        <polygon
          fill="url(#heroCubeA)"
          points="40,4 70,20 70,52 40,68 10,52 10,20"
        />
        <polygon fill="url(#heroCubeC)" points="40,4 70,20 40,36 10,20" />
        <polygon
          fill="url(#heroCubeB)"
          points="10,20 40,36 40,68 10,52"
          opacity="0.85"
        />
      </g>
      <g opacity="0.85" transform="translate(78,30)">
        <polygon
          fill="url(#heroCubeB)"
          points="28,2 50,14 50,38 28,50 6,38 6,14"
        />
        <polygon fill="url(#heroCubeC)" points="28,2 50,14 28,26 6,14" />
        <polygon
          fill="url(#heroCubeA)"
          points="6,14 28,26 28,50 6,38"
          opacity="0.7"
        />
      </g>
      <g opacity="0.75" transform="translate(170,6)">
        <polygon
          fill="url(#heroCubeC)"
          points="20,2 36,10 36,28 20,36 4,28 4,10"
        />
        <polygon
          fill="url(#heroCubeA)"
          points="4,10 20,18 20,36 4,28"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}
