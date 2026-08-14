import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { App, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";
import type { ApplicationDraft } from "@ai-hub/contracts";

import { FormWizard } from "../../shared/forms/FormWizard";
import {
  applicationDraftDefaults,
  createWizardSteps,
  createApplicationDraft,
  getApplicationDraft,
  listCategories,
  listTags,
  saveApplicationDraft,
  type PublishingOptions,
} from "../../modules/publishing";
import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";

export default function ApplicationCreateWizardPage() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const draftIdFromQuery = searchParams.get("applicationId");

  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [defaultValues, setDefaultValues] = useState<FieldValues>(
    applicationDraftDefaults as unknown as FieldValues,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
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
        if (draftIdFromQuery) {
          const record = await getApplicationDraft(draftIdFromQuery);
          if (!cancelled) {
            setApplicationId(draftIdFromQuery);
            setDefaultValues(record.draft as unknown as FieldValues);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveDraft = async (values: FieldValues) => {
    if (!applicationId) return;
    setSaveState("saving");
    try {
      await saveApplicationDraft(applicationId, values as ApplicationDraft);
      setSaveState("saved");
      message.success("草稿已保存");
    } catch {
      setSaveState("idle");
      message.error("草稿保存失败");
    }
  };

  const handleSubmit = async (values: FieldValues) => {
    if (!applicationId) return;
    await saveApplicationDraft(applicationId, values as ApplicationDraft);
    message.success("已通过完整性校验并保存草稿");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 120 }}>
        <Spin />
      </div>
    );
  }

  return (
    <FormWizard
      steps={createWizardSteps(options, applicationId ?? "")}
      defaultValues={defaultValues}
      onSaveDraft={handleSaveDraft}
      onSubmit={handleSubmit}
      saveState={saveState}
    />
  );
}
