import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { message, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FieldValues, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ApplicationDraft } from "@ai-hub/contracts";

import { formatSubmitError } from "../../modules/application/application.errors";
import { FormWizard } from "../../shared/forms/FormWizard";
import {
  applicationDraftDefaults,
  applicationDraftFormSchema,
  createWizardSteps,
  createApplicationDraft,
  defaultDeliveriesForType,
  getApplicationDraft,
  listCategories,
  listTags,
  saveApplicationDraft,
  submitApplicationDraft,
  type PublishingOptions,
} from "../../modules/publishing";
import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";

export default function ApplicationCreateWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdFromQuery = searchParams.get("applicationId");
  const wizardType =
    searchParams.get("type") ?? (draftIdFromQuery ? "edit" : "add");

  const [applicationId, setApplicationId] = useState<string | null>(null);
  // 当前应用状态：编辑模式从草稿记录读取；新增模式为 draft。
  const [appStatus, setAppStatus] = useState<string>("draft");
  const [defaultValues, setDefaultValues] = useState<FieldValues>(
    applicationDraftDefaults as unknown as FieldValues,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [loading, setLoading] = useState(true);

  // 数据源：部门/员工/分类/标签。
  const departmentsQuery = useDepartments();
  const employeesQuery = useEmployees();
  const categoriesQuery = useQuery({
    queryFn: listCategories,
    queryKey: ["catalog", "categories"],
  });
  const tagsQuery = useQuery({
    queryFn: listTags,
    queryKey: ["catalog", "tags"],
  });

  const options: PublishingOptions = useMemo(
    () => ({
      departments: (departmentsQuery.data ?? []).map((d) => ({
        value: d.departmentId,
        label: d.name,
      })),
      categories: (categoriesQuery.data ?? []).map((c) => ({
        value: c.categoryId,
        label: c.name,
      })),
      tags: (tagsQuery.data ?? []).map((t) => ({
        value: t.tagId,
        label: t.name,
      })),
      employees: (employeesQuery.data ?? [])
        .filter((e) => e.status === "active")
        .map((e) => ({ value: e.employeeId, label: e.displayName })),
    }),
    [
      departmentsQuery.data,
      employeesQuery.data,
      categoriesQuery.data,
      tagsQuery.data,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (wizardType === "edit" && draftIdFromQuery) {
          const record = await getApplicationDraft(draftIdFromQuery);
          if (!cancelled) {
            setApplicationId(draftIdFromQuery);
            setAppStatus(record.status);
            setDefaultValues({
              ...(record.draft as unknown as FieldValues),
              manualHtml: record.draft.manualHtml ?? "",
              examplesHtml: record.draft.examplesHtml ?? "",
            });
          }
        } else if (wizardType === "edit" && !draftIdFromQuery) {
          message.error("编辑模式缺少应用 ID");
        }
        // 新增模式：不预创建草稿，首次有效「下一步」/「存草稿」时才惰性创建，
        // 校验不通过或直接离开页面不会产生空草稿。
      } catch {
        message.error("初始化草稿失败，请刷新重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 惰性创建草稿：仅当首次有效「下一步」或「存草稿」时才调用创建接口；
   * 编辑模式直接复用 URL 中的 applicationId，不重复创建。
   */
  const ensureDraft = async (): Promise<string | null> => {
    if (applicationId) return applicationId;
    const created = await createApplicationDraft();
    setApplicationId(created.applicationId);
    return created.applicationId;
  };

  const withDeliveries = (values: FieldValues): ApplicationDraft => {
    const draft = { ...(values as ApplicationDraft) };
    if (!draft.deliveries || draft.deliveries.length === 0) {
      draft.deliveries = defaultDeliveriesForType(
        draft.applicationType,
      ) as ApplicationDraft["deliveries"];
    }
    return draft;
  };

  const handleSaveDraft = async (values: FieldValues) => {
    setSaveState("saving");
    try {
      const id = await ensureDraft();
      if (!id) return;
      await saveApplicationDraft(id, withDeliveries(values));
      setSaveState("saved");
      message.success("草稿已保存");
    } catch {
      setSaveState("idle");
      message.error("草稿保存失败");
    }
  };

  // 与后端 submitDraft 的状态机一致：仅 draft / published 可提交审核；
  // 已进入审核（in_review）等状态重复提交会返回 INVALID_APPLICATION_TRANSITION。
  const submittable = appStatus === "draft" || appStatus === "published";

  const handleSubmit = async (values: FieldValues) => {
    if (!applicationId) return;
    if (!submittable) {
      message.info("该应用已提交审核，无法重复提交，请到应用详情页查看");
      navigate(`/creator/${applicationId}`);
      return;
    }
    try {
      await saveApplicationDraft(applicationId, withDeliveries(values));
      await submitApplicationDraft(applicationId);
      message.success("已提交审核");
      navigate(`/creator/${applicationId}`);
    } catch (error) {
      // 提交失败必须用户可见：展示业务错误映射（DRAFT_VALIDATION_FAILED 附问题清单）。
      message.error(formatSubmitError(error));
    }
  };

  if (loading) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", paddingTop: 120 }}
      >
        <Spin />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      <FormWizard
        steps={createWizardSteps(options, applicationId ?? "")}
        defaultValues={defaultValues}
        onNextSuccess={async () => {
          await ensureDraft();
        }}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        saveState={saveState}
        submitDisabled={!submittable}
        resolver={
          zodResolver(
            applicationDraftFormSchema,
          ) as unknown as Resolver<FieldValues>
        }
      />
    </div>
  );
}
