import type { DemandStatus } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Timeline,
  Typography,
} from "antd";
import { useEffect, useState } from "react";

import { useActor } from "../../modules/auth/useIdentity";
import { hasPermission } from "../../modules/auth/roles";
import {
  useAddDemandCollaborator,
  useAddDemandProgress,
  useAdvanceDemandStatus,
  useClaimDemand,
  useCreateApplicationFromDemand,
  useCreateDemandPilot,
  useDemandGovernanceData,
  useLinkDemandApplication,
  useLookupAnonymousAuthor,
  useMergeDemand,
  useRemoveDemandApplication,
  useRemoveDemandCollaborator,
  useReviewDemand,
  useResolveDemandReport,
  useSetDemandPriority,
  useSubmitDemandForReview,
  useUpdateDemandCollaboratorRole,
} from "../../modules/innovation/useDemand";
import { demandStatusText } from "../../modules/innovation/demandMeta";
import type {
  DemandApplicationLinkRecord,
  DemandCollaboratorRecord,
  DemandPilotRecord,
  DemandReportRecord,
} from "../../modules/innovation/demand.client";
import type { DemandView } from "./innovation.types";

export interface DemandGovernanceDrawerProps {
  demand: DemandView;
  open: boolean;
  onClose: () => void;
}

const statusOptions = (
  ["published", "in_progress", "pilot", "completed", "closed"] as DemandStatus[]
).map((value) => ({
  label: demandStatusText[value],
  value,
}));

export function DemandGovernanceDrawer({
  demand,
  open,
  onClose,
}: DemandGovernanceDrawerProps) {
  const actor = useActor();
  const can = (permission: string) =>
    hasPermission(actor.data ?? null, permission);
  const governance = useDemandGovernanceData(demand.demandId, open);
  const submitReview = useSubmitDemandForReview(demand.demandId);
  const review = useReviewDemand(demand.demandId);
  const claim = useClaimDemand(demand.demandId);
  const advance = useAdvanceDemandStatus(demand.demandId);
  const priority = useSetDemandPriority(demand.demandId);
  const removeCollaborator = useRemoveDemandCollaborator(demand.demandId);
  const removeApplication = useRemoveDemandApplication(demand.demandId);
  const addCollaborator = useAddDemandCollaborator(demand.demandId);
  const updateCollaboratorRole = useUpdateDemandCollaboratorRole(
    demand.demandId,
  );
  const addProgress = useAddDemandProgress(demand.demandId);
  const createPilot = useCreateDemandPilot(demand.demandId);
  const linkApplication = useLinkDemandApplication(demand.demandId);
  const createApplication = useCreateApplicationFromDemand(demand.demandId);
  const merge = useMergeDemand(demand.demandId);
  const resolveReport = useResolveDemandReport(demand.demandId);
  const lookupAuthor = useLookupAnonymousAuthor(demand.demandId);
  const [priorityForm] = Form.useForm();
  const [status, setStatus] = useState<DemandStatus | undefined>(undefined);

  useEffect(() => {
    priorityForm.setFieldsValue({
      adminPriority: demand.adminPriority ?? 3,
      businessValue: demand.businessValue ?? 3,
      implementationCost: demand.implementationCost ?? 3,
      riskLevel: demand.riskLevel ?? 3,
    });
    setStatus(undefined);
  }, [demand, priorityForm]);

  const confirm = (title: string, action: () => void) => {
    Modal.confirm({
      cancelText: "取消",
      content: "该操作会写入审计记录，是否继续？",
      okText: "确认",
      onOk: action,
      title,
    });
  };

  return (
    <Drawer
      className="innovation-governance-drawer"
      onClose={onClose}
      open={open}
      placement="right"
      title="需求治理"
      width={720}
    >
      <Tabs
        items={[
          {
            key: "workflow",
            label: "流程与优先级",
            children: (
              <div className="space-y-4">
                <Card size="small" title="流程动作">
                  <Space wrap>
                    {can(PERMISSIONS.DEMAND_SUBMIT) &&
                    demand.status === "draft" ? (
                      <Button
                        loading={submitReview.isPending}
                        onClick={() => submitReview.mutate()}
                      >
                        提交审核
                      </Button>
                    ) : null}
                    {can(PERMISSIONS.DEMAND_REVIEW) &&
                    demand.status === "pending_review" ? (
                      <>
                        <Button
                          loading={review.isPending}
                          onClick={() =>
                            confirm("审核通过并发布需求", () =>
                              review.mutate({ decision: "publish" }),
                            )
                          }
                          type="primary"
                        >
                          审核发布
                        </Button>
                        <Button
                          danger
                          loading={review.isPending}
                          onClick={() =>
                            confirm("驳回这条需求", () =>
                              review.mutate({
                                decision: "reject",
                                reason: "需要补充业务背景",
                              }),
                            )
                          }
                        >
                          驳回
                        </Button>
                      </>
                    ) : null}
                    {can(PERMISSIONS.DEMAND_CLAIM) &&
                    !demand.ownerEmployeeId ? (
                      <Button
                        loading={claim.isPending}
                        onClick={() => claim.mutate(demand.version)}
                      >
                        认领需求
                      </Button>
                    ) : null}
                    {can(PERMISSIONS.DEMAND_PROGRESS) ? (
                      <>
                        <Select
                          allowClear
                          className="min-w-36"
                          onChange={setStatus}
                          options={statusOptions}
                          placeholder="推进状态"
                          value={status}
                        />
                        <Button
                          disabled={!status}
                          loading={advance.isPending}
                          onClick={() =>
                            status &&
                            confirm(`推进为${demandStatusText[status]}`, () =>
                              advance.mutate({
                                status,
                                expectedVersion: demand.version,
                              }),
                            )
                          }
                        >
                          保存状态
                        </Button>
                      </>
                    ) : null}
                  </Space>
                </Card>
                <Card size="small" title="四项优先级指标">
                  {can(PERMISSIONS.DEMAND_PRIORITIZE) ? (
                    <Form
                      form={priorityForm}
                      layout="vertical"
                      onFinish={(values) =>
                        priority.mutate({
                          ...values,
                          expectedVersion: demand.version,
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Form.Item label="业务价值" name="businessValue">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="管理优先级" name="adminPriority">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="实施成本" name="implementationCost">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="风险等级" name="riskLevel">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                      </div>
                      <Button
                        htmlType="submit"
                        loading={priority.isPending}
                        type="primary"
                      >
                        保存优先级
                      </Button>
                    </Form>
                  ) : (
                    <Typography.Text type="secondary">
                      你没有调整优先级的权限。
                    </Typography.Text>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: "collaborators",
            label: "协作成员",
            children: (
              <div className="space-y-3">
                {(governance.collaborators.data ?? []).length ? (
                  governance.collaborators.data?.map(
                    (item: DemandCollaboratorRecord) => (
                      <Card key={item.employeeId} size="small">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span>{item.employeeId}</span>
                          {can(PERMISSIONS.DEMAND_COLLABORATE) ? (
                            <Space wrap>
                              <Select<"owner" | "collaborator" | "operator">
                                aria-label={`${item.employeeId} 协作角色`}
                                value={item.role}
                                options={[
                                  {
                                    label: "负责人",
                                    value: "owner",
                                    disabled: true,
                                  },
                                  { label: "协作者", value: "collaborator" },
                                  { label: "运营负责人", value: "operator" },
                                ]}
                                disabled={item.role === "owner"}
                                onChange={(role) => {
                                  if (role === "owner") return;
                                  updateCollaboratorRole.mutate({
                                    employeeId: item.employeeId,
                                    role,
                                    expectedVersion: demand.version,
                                  });
                                }}
                              />
                              <Button
                                danger
                                disabled={item.role === "owner"}
                                size="small"
                                onClick={() =>
                                  confirm("移除该协作者", () =>
                                    removeCollaborator.mutate({
                                      employeeId: item.employeeId,
                                      expectedVersion: demand.version,
                                    }),
                                  )
                                }
                              >
                                移除
                              </Button>
                            </Space>
                          ) : null}
                        </div>
                      </Card>
                    ),
                  )
                ) : (
                  <Empty description="暂未添加协作者" />
                )}
                {can(PERMISSIONS.DEMAND_COLLABORATE) ? (
                  <Button
                    type="dashed"
                    block
                    onClick={() => {
                      const employeeId = window.prompt("请输入员工工号");
                      if (employeeId)
                        addCollaborator.mutate({
                          employeeId,
                          role: "collaborator",
                          expectedVersion: demand.version,
                        });
                    }}
                  >
                    添加协作者
                  </Button>
                ) : null}
              </div>
            ),
          },
          {
            key: "progress",
            label: "进展与试点",
            children: (
              <div className="space-y-4">
                <Timeline
                  items={[
                    ...(governance.progress.data ?? []).map((item) => ({
                      children: `${item.title} · ${item.status} · ${item.body}`,
                      color: "blue" as const,
                    })),
                    ...(governance.pilots.data ?? []).map(
                      (item: DemandPilotRecord) => ({
                        children: `${item.name} · ${item.status}${item.outcome ? ` · ${item.outcome}` : ""}`,
                        color: "green" as const,
                      }),
                    ),
                  ]}
                />
                {!governance.pilots.data?.length ? (
                  <Empty description="暂无试点记录" />
                ) : null}
                {can(PERMISSIONS.DEMAND_PROGRESS) ? (
                  <Space wrap>
                    <Button
                      type="dashed"
                      onClick={() => {
                        const title = window.prompt("进展标题");
                        const body = window.prompt("进展内容");
                        if (title && body)
                          addProgress.mutate({
                            status: demand.status,
                            title,
                            body,
                          });
                      }}
                    >
                      新增进展
                    </Button>
                    <Button
                      type="primary"
                      onClick={() => {
                        const name = window.prompt("试点名称");
                        if (name)
                          createPilot.mutate({
                            name,
                            startsAt: new Date().toISOString(),
                          });
                      }}
                    >
                      创建试点
                    </Button>
                  </Space>
                ) : null}
              </div>
            ),
          },
          {
            key: "solutions",
            label: "解决方案",
            children: (
              <div className="space-y-3">
                {(governance.applications.data ?? []).length ? (
                  governance.applications.data?.map(
                    (item: DemandApplicationLinkRecord) => (
                      <Card key={item.applicationId} size="small">
                        <div className="flex items-center justify-between gap-3">
                          <span>{item.applicationId}</span>
                          {can(PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION) ? (
                            <Button
                              danger
                              size="small"
                              onClick={() =>
                                confirm("解除该应用关联", () =>
                                  removeApplication.mutate({
                                    applicationId: item.applicationId,
                                    expectedVersion: demand.version,
                                  }),
                                )
                              }
                            >
                              解除关联
                            </Button>
                          ) : null}
                        </div>
                      </Card>
                    ),
                  )
                ) : (
                  <Empty description="暂未关联应用" />
                )}
                {can(PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION) ? (
                  <Space wrap>
                    <Button
                      type="dashed"
                      onClick={() => {
                        const applicationId = window.prompt("请输入应用 ID");
                        if (applicationId)
                          linkApplication.mutate({
                            applicationId,
                            role: "candidate",
                            expectedVersion: demand.version,
                          });
                      }}
                    >
                      关联已有应用
                    </Button>
                    <Button
                      type="primary"
                      onClick={() => {
                        const name = window.prompt("应用名称");
                        const summary = window.prompt("应用简介");
                        if (name && summary)
                          createApplication.mutate({ name, summary });
                      }}
                    >
                      从需求创建应用
                    </Button>
                  </Space>
                ) : null}
              </div>
            ),
          },
          {
            key: "risk",
            label: "风控审计",
            children: (
              <div className="space-y-4">
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="审计说明">
                    敏感操作需要确认，并写入审计与 Outbox。
                  </Descriptions.Item>
                  <Descriptions.Item label="匿名追溯">
                    仅 demand.anonymous_audit 权限可见，执行前需二次确认。
                  </Descriptions.Item>
                </Descriptions>
                {can(PERMISSIONS.DEMAND_MODERATE) ? (
                  <div className="space-y-3">
                    <Typography.Title level={5}>举报处理</Typography.Title>
                    {(governance.reports.data ?? []).length ? (
                      governance.reports.data?.map(
                        (item: DemandReportRecord) => (
                          <Card key={item.reportId} size="small">
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                {item.reason} · {item.status}
                              </span>
                              {item.status === "open" ? (
                                <Button
                                  size="small"
                                  onClick={() =>
                                    resolveReport.mutate({
                                      reportId: item.reportId,
                                      status: "dismissed",
                                    })
                                  }
                                >
                                  标记已处理
                                </Button>
                              ) : null}
                            </div>
                          </Card>
                        ),
                      )
                    ) : (
                      <Empty description="暂无待处理举报" />
                    )}
                  </div>
                ) : (
                  <Typography.Text type="secondary">
                    你没有查看举报的权限。
                  </Typography.Text>
                )}
                {can(PERMISSIONS.DEMAND_MERGE) ? (
                  <Button
                    danger
                    onClick={() => {
                      const targetDemandId = window.prompt("请输入目标需求 ID");
                      if (targetDemandId)
                        merge.mutate({
                          targetDemandId,
                          sourceExpectedVersion: demand.version,
                          targetExpectedVersion: 1,
                        });
                    }}
                  >
                    合并到其他可见需求
                  </Button>
                ) : null}
                {can(PERMISSIONS.DEMAND_ANONYMOUS_AUDIT) ? (
                  <Button
                    loading={lookupAuthor.isPending}
                    onClick={() => {
                      const commentId = window.prompt("请输入匿名评论 ID");
                      if (commentId)
                        confirm("追溯匿名作者", () =>
                          lookupAuthor.mutate({ commentId }),
                        );
                    }}
                  >
                    追溯匿名作者
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
