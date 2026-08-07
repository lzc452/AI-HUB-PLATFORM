import { Alert, Card, Skeleton } from "antd";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { ForbiddenBlock } from "../../components/common/ForbiddenBlock";
import { NotFoundBlock } from "../../components/common/NotFoundBlock";
import { rememberLastViewedApplicationId } from "../../modules/application/last-viewed";
import { useRateApplication, useToggleLike } from "../../modules/interaction/useInteraction";
import { useCatalogEntry } from "../../modules/marketplace/useCatalog";
import { ApiError } from "../../shared/api/client";
import { MarketplaceDetailDescription } from "./detail/MarketplaceDetailDescription";
import { MarketplaceDetailHeader } from "./detail/MarketplaceDetailHeader";
import {
  MarketplaceDetailTabs,
  useDetailTabParam,
} from "./detail/MarketplaceDetailTabs";

function MarketplaceDetailSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: 240 }} />
      <Card className="rounded-2xl">
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
        <Card className="rounded-2xl">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      </div>
    </div>
  );
}

export default function MarketplaceDetailPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useCatalogEntry(applicationId);
  const toggleLike = useToggleLike(applicationId);
  const rateApplication = useRateApplication(applicationId);
  const { activeTab, setTab } = useDetailTabParam();

  useEffect(() => {
    if (applicationId) {
      rememberLastViewedApplicationId(applicationId);
    }
  }, [applicationId]);

  if (isPending) return <MarketplaceDetailSkeleton />;

  if (isError || !data) {
    if (error instanceof ApiError && error.status === 403)
      return <ForbiddenBlock description="您没有访问此应用的权限" />;
    if (error instanceof ApiError && error.status === 404)
      return <NotFoundBlock />;
    return (
      <ErrorBlock
        description={error?.message ?? "应用不存在或当前员工无权访问。"}
        title="应用详情加载失败"
      />
    );
  }

  return (
    <div className="space-y-4">
      <MarketplaceDetailHeader
        entry={data}
        interactionError={
          Boolean(toggleLike.isError) || Boolean(rateApplication.isError)
        }
        likePending={toggleLike.isPending}
        onLike={() => toggleLike.mutate()}
        onRate={(stars) => rateApplication.mutate(stars)}
        ratingDisabled={Boolean(!applicationId || rateApplication.isPending)}
        ratingPending={rateApplication.isPending}
      />
      <MarketplaceDetailTabs activeTab={activeTab} onTabChange={setTab} />
      {activeTab === "description" ? (
        <MarketplaceDetailDescription entry={data} />
      ) : (
        <Alert
          showIcon
          className="rounded-2xl"
          message={`${activeTab === "history" ? "版本历史" : activeTab === "reviews" ? "评价管理" : "风险说明"} 模块接口待接入`}
          type="info"
        />
      )}
    </div>
  );
}