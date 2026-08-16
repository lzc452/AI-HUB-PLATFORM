import type { DemandStatus } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
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
  useConfirmDemandClaim,
  useConfirmDemandPriority,
  useCreateApplicationFromDemand,
  useCreateDemandPilot,
  useDemandClaimProposals,
  useDemandGovernanceData,
  useLinkDemandApplication,
  useLookupAnonymousAuthor,
  useMergeDemand,
  useReleaseDemandClaim,
  useRemoveDemandApplication,
  useRemoveDemandCollaborator,
  useReviewDemand,
  useResolveDemandReport,
  useSetDemandPriority,
  useSubmitDemandClaimProposal,
  useSubmitDemandForReview,
  useUpdateDemandCollaboratorRole,
  useWithdrawDemandClaimProposal,
} from "../../modules/innovation/useDemand";
import { demandStatusText } from "../../modules/innovation/demandMeta";
import type {
  DemandApplicationLinkRecord,
  DemandClaimProposalRecord,
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
  [
    "pending_claim",
    "claimed",
    "validating",
    "pilot",
    "converted",
    "closed",
  ] as DemandStatus[]
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
  const confirmPriority = useConfirmDemandPriority(demand.demandId);
  const claimProposals = useDemandClaimProposals(demand.demandId, open);
  const submitProposal = useSubmitDemandClaimProposal(demand.demandId);
  const withdrawProposal = useWithdrawDemandClaimProposal(demand.demandId);
  const confirmClaim = useConfirmDemandClaim(demand.demandId);
  const releaseClaim = useReleaseDemandClaim(demand.demandId);
  const [priorityForm] = Form.useForm();
  const [proposalForm] = Form.useForm();
  const [status, setStatus] = useState<DemandStatus | undefined>(undefined);
  const [confirmedPriority, setConfirmedPriority] = useState<
    "high" | "medium" | "low" | null
  >(null);

  useEffect(() => {
    priorityForm.setFieldsValue({
      businessValue: demand.businessValue ?? 3,
      impactedHeadcount: demand.impactedHeadcount ?? 3,
      usageFrequency: demand.usageFrequency ?? 3,
      strategicFit: demand.strategicFit ?? 3,
      technicalFeasibility: demand.technicalFeasibility ?? 3,
      dataComplianceRisk: demand.dataComplianceRisk ?? 3,
      implementationCost: demand.implementationCost ?? 3,
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
                <Card size="small" title="七维优先级评估">
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
                        <Form.Item label="影响人数" name="impactedHeadcount">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="使用频率" name="usageFrequency">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="战略匹配度" name="strategicFit">
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item
                          label="技术可行性"
                          name="technicalFeasibility"
                        >
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item
                          label="数据合规风险"
                          name="dataComplianceRisk"
                        >
                          <InputNumber className="w-full" max={5} min={1} />
                        </Form.Item>
                        <Form.Item label="实施成本" name="implementationCost">
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
                <Card size="small" title="确认优先级（高/中/低）">
                  {can(PERMISSIONS.DEMAND_PRIORITIZE) ? (
                    <Space wrap>
                      <Select<"high" | "medium" | "low">
                        allowClear
                        className="min-w-32"
                        onChange={setConfirmedPriority}
                        options={[
                          { label: "高", value: "high" },
                          { label: "中", value: "medium" },
                          { label: "低", value: "low" },
                        ]}
                        placeholder="选择优先级"
                        value={confirmedPriority}
                      />
                      <Button
                        disabled={!confirmedPriority}
                        loading={confirmPriority.isPending}
                        onClick={() => {
                          const reason =
                            window.prompt("调整原因（可留空）") ?? "";
                          if (confirmedPriority)
                            confirmPriority.mutate({
                              expectedVersion: demand.version,
                              confirmedPriority,
                              ...(reason.trim()
                                ? { adjustmentReason: reason.trim() }
                                : {}),
                            });
                        }}
                        type="primary"
                      >
                        确认优先级
                      </Button>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">
                      你没有确认优先级的权限。
                    </Typography.Text>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: "claim-proposals",
            label: "认领方案",
            children: (
              <div className="space-y-4">
                {(claimProposals.data ?? []).length ? (
                  claimProposals.data?.map(
                    (proposal: DemandClaimProposalRecord) => (
                      <Card
                        key={proposal.proposalId}
                        size="small"
                        title={`方案 · 负责人 ${proposal.ownerEmployeeId} · ${proposal.status}`}
                      >
                        <Typography.Paragraph className="!mb-2">
                          {proposal.approach}
                        </Typography.Paragraph>
                        <Typography.Paragraph
                          className="!mb-0 text-xs"
                          type="secondary"
                        >
                          协作者：
                          {proposal.collaboratorEmployeeIds.join("、") ||
                            "无"}{" "}
                          · 预计验证 {proposal.estimatedValidationDuration} ·
                          资源 {proposal.resourceNeeds}
                        </Typography.Paragraph>
                        <Space className="mt-3" wrap>
                          {proposal.status === "proposed" &&
                          proposal.proposerEmployeeId ===
                            actor.data?.employeeId ? (
                            <Button
                              size="small"
                              onClick={() =>
                                withdrawProposal.mutate({
                                  proposalId: proposal.proposalId,
                                })
                              }
                            >
                              撤回
                            </Button>
                          ) : null}
                          {can(PERMISSIONS.DEMAND_MANAGE) &&
                          proposal.status === "proposed" &&
                          demand.status === "pending_claim" ? (
                            <Button
                              size="small"
                              type="primary"
                              onClick={() =>
                                confirm("确认该认领方案", () =>
                                  confirmClaim.mutate({
                                    proposalId: proposal.proposalId,
                                    expectedVersion: demand.version,
                                  }),
                                )
                              }
                            >
                              确认认领
                            </Button>
                          ) : null}
                        </Space>
                      </Card>
                    ),
                  )
                ) : (
                  <Empty description="暂无认领方案" />
                )}
                {can(PERMISSIONS.DEMAND_CLAIM) &&
                demand.status === "pending_claim" ? (
                  <Form
                    form={proposalForm}
                    layout="vertical"
                    onFinish={(values) =>
                      submitProposal.mutate({
                        ownerEmployeeId: values.ownerEmployeeId,
                        collaboratorEmployeeIds: values.collaboratorEmployeeIds
                          ? String(values.collaboratorEmployeeIds)
                              .split(/[,，]/)
                              .map((s: string) => s.trim())
                              .filter(Boolean)
                          : [],
                        approach: values.approach,
                        estimatedValidationDuration:
                          values.estimatedValidationDuration,
                        resourceNeeds: values.resourceNeeds,
                      })
                    }
                  >
                    <Form.Item
                      label="拟定负责人"
                      name="ownerEmployeeId"
                      rules={[{ required: true, message: "请输入负责人工号" }]}
                    >
                      <Input placeholder="员工工号" />
                    </Form.Item>
                    <Form.Item
                      label="拟定协作者（逗号分隔）"
                      name="collaboratorEmployeeIds"
                    >
                      <Input placeholder="员工工号，逗号分隔" />
                    </Form.Item>
                    <Form.Item
                      label="初步思路"
                      name="approach"
                      rules={[{ required: true, message: "请输入初步思路" }]}
                    >
                      <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
                    </Form.Item>
                    <Form.Item
                      label="预计验证时间"
                      name="estimatedValidationDuration"
                      rules={[
                        { required: true, message: "请输入预计验证时间" },
                      ]}
                    >
                      <Input placeholder="例如 4 周" />
                    </Form.Item>
                    <Form.Item
                      label="资源需求"
                      name="resourceNeeds"
                      rules={[{ required: true, message: "请输入资源需求" }]}
                    >
                      <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                    <Button
                      htmlType="submit"
                      loading={submitProposal.isPending}
                      type="primary"
                    >
                      提交认领方案
                    </Button>
                  </Form>
                ) : null}
                {can(PERMISSIONS.DEMAND_MANAGE) &&
                ["claimed", "validating", "pilot"].includes(demand.status) ? (
                  <Button
                    danger
                    onClick={() => {
                      const reason = window.prompt("解除原因（可留空）") ?? "";
                      confirm("解除认领并重新开放", () =>
                        releaseClaim.mutate({
                          expectedVersion: demand.version,
                          ...(reason.trim() ? { reason: reason.trim() } : {}),
                        }),
                      );
                    }}
                  >
                    解除认领并重新开放
                  </Button>
                ) : null}
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
