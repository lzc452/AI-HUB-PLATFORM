import { Card, Skeleton } from "antd";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { ForbiddenBlock } from "../../components/common/ForbiddenBlock";
import { NotFoundBlock } from "../../components/common/NotFoundBlock";
import { rememberLastViewedApplicationId } from "../../modules/application/last-viewed";
import {
  useComments,
  useHideComment,
  useRateApplication,
  useRatings,
  useRestoreComment,
  useToggleLike,
} from "../../modules/interaction/useInteraction";
import {
  useCatalogEntry,
  useRiskDescription,
  useSaveRiskDescription,
  useVersions,
} from "../../modules/marketplace/useCatalog";
import { ApiError } from "../../shared/api/client";
import { MarketplaceDetailDescription } from "./detail/MarketplaceDetailDescription";
import { MarketplaceDetailHeader } from "./detail/MarketplaceDetailHeader";
import { MarketplaceDetailHistory } from "./detail/MarketplaceDetailHistory";
import { MarketplaceDetailReviews } from "./detail/MarketplaceDetailReviews";
import { MarketplaceDetailRisk } from "./detail/MarketplaceDetailRisk";
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

  // Tab-specific data hooks — only fetch when tab is active
  const versions = useVersions(
    activeTab === "history" ? applicationId : undefined,
  );
  const risk = useRiskDescription(
    activeTab === "risk" ? applicationId : undefined,
  );
  const saveRisk = useSaveRiskDescription(
    activeTab === "risk" ? applicationId : undefined,
  );
  const ratings = useRatings(
    activeTab === "reviews" ? applicationId : undefined,
    1,
    10,
  );
  const comments = useComments(
    activeTab === "reviews" ? applicationId : undefined,
    1,
    10,
  );
  const hideComment = useHideComment(
    activeTab === "reviews" ? applicationId : undefined,
  );
  const restoreComment = useRestoreComment(
    activeTab === "reviews" ? applicationId : undefined,
  );

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
        likePending={toggleLike.isPending}
        onLike={() => toggleLike.mutate()}
        onRate={(stars) => rateApplication.mutate(stars)}
        ratingDisabled={Boolean(!applicationId || rateApplication.isPending)}
        ratingPending={rateApplication.isPending}
      />
      <MarketplaceDetailTabs activeTab={activeTab} onTabChange={setTab} />

      {activeTab === "description" && (
        <MarketplaceDetailDescription entry={data} />
      )}
      {activeTab === "history" && (
        <MarketplaceDetailHistory
          isPending={versions.isPending}
          versions={versions.data}
        />
      )}
      {activeTab === "reviews" && (
        <MarketplaceDetailReviews
          comments={comments.data}
          commentsPending={comments.isPending}
          isModerator={false}
          onHideComment={(id) => hideComment.mutate(id)}
          onRestoreComment={(id) => restoreComment.mutate(id)}
          ratings={ratings.data}
          ratingsPending={ratings.isPending}
        />
      )}
      {activeTab === "risk" && (
        <MarketplaceDetailRisk
          isOwner={false}
          isPending={risk.isPending}
          onSave={(desc) => saveRisk.mutate(desc)}
          risk={risk.data}
          savePending={saveRisk.isPending}
        />
      )}
    </div>
  );
}
