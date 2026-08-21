import { type ReactNode } from "react";

import type { AdminKpiCards } from "../../modules/application/adminListMeta";

export interface ApplicationAdminKpiCardsProps {
  cards: AdminKpiCards;
  isLoading?: boolean;
  /** 无审核权限时不展示"待审核"卡片。 */
  canReview?: boolean;
}

const cardAccentByKey: Record<keyof AdminKpiCards, string> = {
  total: "blue",
  pendingReview: "amber",
  published: "green",
  deliveryFailed: "rose",
};

const order: ReadonlyArray<keyof AdminKpiCards> = [
  "total",
  "pendingReview",
  "published",
  "deliveryFailed",
];

/**
 * 应用管理 KPI 指标行：4 张卡片对应应用总数、待审核、已上架、交付异常。
 * 与设计稿的浅色边框 / 浅色背景 / 主题色图标保持 1:1。
 */
export function ApplicationAdminKpiCards({
  cards,
  isLoading = false,
  canReview = true,
}: ApplicationAdminKpiCardsProps) {
  const visibleOrder = canReview
    ? order
    : order.filter((key) => key !== "pendingReview");
  return (
    <section
      aria-label="应用概览指标"
      className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
    >
      {visibleOrder.map((key) => {
        const card = cards[key];
        return (
          <article
            aria-busy={isLoading}
            className="group flex items-start gap-3 rounded-2xl border bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4"
            data-accent={cardAccentByKey[key]}
            key={key}
            style={{ borderColor: card.border, background: card.background }}
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
              style={{
                background: card.iconBackground,
                color: card.iconColor,
              }}
            >
              <KpiIcon name={key} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs !text-[#595959]">{card.label}</p>
              <p
                className="m-0 mt-1 text-2xl font-semibold leading-none !text-[#1f1f1f] sm:text-[28px]"
                style={{ color: card.accent }}
              >
                {isLoading ? "—" : card.value}
              </p>
              <p className="m-0 mt-2 text-xs !text-[#8c8c8c]">{card.hint}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function KpiIcon({ name }: { name: keyof AdminKpiCards }): ReactNode {
  // 直接用统一描边宽度的简单几何图形，确保色块和线条粗细与设计稿一致。
  const stroke = {
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
  };
  if (name === "total") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="22"
        viewBox="0 0 24 24"
        width="22"
      >
        <rect
          {...stroke}
          fill="none"
          height="14"
          rx="1.5"
          stroke="currentColor"
          width="18"
          x="3"
          y="5"
        />
        <path
          {...stroke}
          d="M3 9h18M7 13h4M7 16h7"
          fill="none"
          stroke="currentColor"
        />
      </svg>
    );
  }
  if (name === "pendingReview") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="22"
        viewBox="0 0 24 24"
        width="22"
      >
        <path
          {...stroke}
          d="M7 4h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
          fill="none"
          stroke="currentColor"
        />
        <path
          {...stroke}
          d="M14 4v4h4M9 13h6M9 16h4"
          fill="none"
          stroke="currentColor"
        />
      </svg>
    );
  }
  if (name === "published") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="22"
        viewBox="0 0 24 24"
        width="22"
      >
        <path
          {...stroke}
          d="M5 12.5 10 17l9-10"
          fill="none"
          stroke="currentColor"
        />
        <path
          {...stroke}
          d="M5 19h14"
          fill="none"
          opacity="0.6"
          stroke="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        {...stroke}
        d="M12 3 3 6v6c0 4.5 3.4 8.4 9 9 5.6-.6 9-4.5 9-9V6l-9-3Z"
        fill="none"
        stroke="currentColor"
      />
      <path
        {...stroke}
        d="M12 8v4M12 16h.01"
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}
