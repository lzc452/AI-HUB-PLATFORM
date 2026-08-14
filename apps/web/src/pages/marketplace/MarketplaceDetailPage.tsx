import { Card, message, Modal, Skeleton } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { ForbiddenBlock } from "../../components/common/ForbiddenBlock";
import { NotFoundBlock } from "../../components/common/NotFoundBlock";
import { rememberLastViewedApplicationId } from "../../modules/application/last-viewed";
import {
  useComments,
  useCreateFeedback,
  useCreateComment,
  useHideComment,
  useMyFeedback,
  useRateApplication,
  useRatings,
  useRestoreComment,
  useToggleLike,
} from "../../modules/interaction/useInteraction";
import {
  downloadDeliveryAsset,
  resolveDelivery,
  type DeliveryChannel,
} from "../../modules/marketplace/marketplace.client";
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
  const [commentsPage, setCommentsPage] = useState(1);
  const [ratingsPage, setRatingsPage] = useState(1);
  const [resolving, setResolving] = useState(false);

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
    ratingsPage,
    10,
  );
  const comments = useComments(
    activeTab === "reviews" ? applicationId : undefined,
    commentsPage,
    10,
  );
  const hideComment = useHideComment(
    activeTab === "reviews" ? applicationId : undefined,
  );
  const restoreComment = useRestoreComment(
    activeTab === "reviews" ? applicationId : undefined,
  );
  const createComment = useCreateComment(
    activeTab === "reviews" ? applicationId : undefined,
  );
  const createFeedback = useCreateFeedback(applicationId);
  const myFeedback = useMyFeedback(
    activeTab === "reviews" ? applicationId : undefined,
  );

  useEffect(() => {
    if (applicationId) {
      rememberLastViewedApplicationId(applicationId);
    }
  }, [applicationId]);

  // 交付解析：web 跳转、download 触发浏览器下载、qr 弹窗展示、unavailable 提示。
  const handleResolve = async (channel: DeliveryChannel) => {
    if (!applicationId) return;
    setResolving(true);
    try {
      const result = await resolveDelivery(applicationId, channel);
      if (result.kind === "web_redirect") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (result.kind === "download") {
        const { blob, fileName } = await downloadDeliveryAsset(
          applicationId,
          channel,
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      } else if (result.kind === "qr") {
        Modal.info({
          content: (
            <div className="py-2 text-center">
              <div>请使用企业微信 / 对应 App 扫码</div>
              <div className="mt-2 break-all text-xs text-[#595959]">
                {result.payload}
              </div>
            </div>
          ),
          title: "扫码使用",
        });
      } else {
        message.warning(result.reason);
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "交付解析失败");
    } finally {
      setResolving(false);
    }
  };

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
        onResolve={(channel) => void handleResolve(channel)}
        ratingDisabled={Boolean(!applicationId || rateApplication.isPending)}
        ratingPending={rateApplication.isPending}
        resolving={resolving}
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
          commentsPage={commentsPage}
          commentsPending={comments.isPending}
          createComment={createComment}
          createFeedback={createFeedback}
          isModerator={data.capabilities?.canModerateComments ?? false}
          myFeedback={myFeedback.data}
          onCommentsPageChange={setCommentsPage}
          onHideComment={(id) => hideComment.mutate(id)}
          onRestoreComment={(id) => restoreComment.mutate(id)}
          onRatingsPageChange={setRatingsPage}
          ratings={ratings.data}
          ratingsPage={ratingsPage}
          ratingsPending={ratings.isPending}
        />
      )}
      {activeTab === "risk" && (
        <MarketplaceDetailRisk
          isOwner={data.capabilities?.canEditRisk ?? false}
          isPending={risk.isPending}
          onSave={(desc) => saveRisk.mutate(desc)}
          risk={risk.data}
          savePending={saveRisk.isPending}
        />
      )}
    </div>
  );
}
