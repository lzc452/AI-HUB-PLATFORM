import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FieldValues, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ApplicationDraft } from "@ai-hub/contracts";

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
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdFromQuery = searchParams.get("applicationId");
  const wizardType =
    searchParams.get("type") ?? (draftIdFromQuery ? "edit" : "add");

  const [applicationId, setApplicationId] = useState<string | null>(null);
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
            setDefaultValues({
              ...(record.draft as unknown as FieldValues),
              manualHtml: record.draft.manualHtml ?? "",
              examplesHtml: record.draft.examplesHtml ?? "",
            });
          }
        } else if (wizardType === "edit" && !draftIdFromQuery) {
          message.error("编辑模式缺少应用 ID");
        } else {
          const created = await createApplicationDraft();
          if (!cancelled) setApplicationId(created.applicationId);
        }
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
    if (!applicationId) return;
    setSaveState("saving");
    try {
      await saveApplicationDraft(applicationId, withDeliveries(values));
      setSaveState("saved");
      message.success("草稿已保存");
    } catch {
      setSaveState("idle");
      message.error("草稿保存失败");
    }
  };

  const handleSubmit = async (values: FieldValues) => {
    if (!applicationId) return;
    await saveApplicationDraft(applicationId, withDeliveries(values));
    await submitApplicationDraft(applicationId);
    message.success("已提交审核");
    navigate(`/creator/${applicationId}`);
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
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        saveState={saveState}
        resolver={zodResolver(applicationDraftFormSchema) as unknown as Resolver<FieldValues>}
      />
    </div>
  );
}
