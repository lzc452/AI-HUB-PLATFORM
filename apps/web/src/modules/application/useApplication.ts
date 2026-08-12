import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveApplication,
  getApplication,
  getApplicationWorkspace,
  getApplicationDeliveries,
  getApplicationReviews,
  getApplicationVersions,
  getCreatorApplications,
  getCreatorSummary,
  getPublishedVersion,
  withdrawApplication,
} from "./application.client";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

export function useApplication(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplication(applicationId as string),
    queryKey: ["applications", "detail", applicationId],
  });
}

export function useApplicationWorkspace(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationWorkspace(applicationId as string),
    queryKey: ["applications", "workspace", applicationId],
  });
}

export function useApplicationVersions(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationVersions(applicationId as string),
    queryKey: ["applications", "versions", applicationId],
  });
}

export function useApplicationDeliveries(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationDeliveries(applicationId as string),
    queryKey: ["applications", "deliveries", applicationId],
  });
}

export function useApplicationReviews(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplicationReviews(applicationId as string),
    queryKey: ["applications", "reviews", applicationId],
  });
}

export function usePublishedVersion(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getPublishedVersion(applicationId as string),
    queryKey: ["applications", "published-version", applicationId],
  });
}

export function useCreatorSummary(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getCreatorSummary(applicationId as string),
    queryKey: ["creator", "summary", applicationId],
  });
}

export function useCreatorApplications() {
  return useQuery({
    queryFn: getCreatorApplications,
    queryKey: ["creator", "applications"],
  });
}

/** 失效受 mutation 影响的全部缓存域：创作者列表、市场目录与应用管理。 */
function useInvalidateApplicationCaches() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["creator"] }),
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["applications"] }),
    ]);
  };
}

export function useWithdrawApplication() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationId: string) => withdrawApplication(applicationId),
    onError: (error) => showErrorMessage(error, "应用下架失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已下架");
    },
  });
}

export function useArchiveApplication() {
  const invalidateCaches = useInvalidateApplicationCaches();
  return useMutation({
    mutationFn: (applicationId: string) => archiveApplication(applicationId),
    onError: (error) => showErrorMessage(error, "应用归档失败"),
    onSuccess: async () => {
      await invalidateCaches();
      showSuccessMessage("应用已归档");
    },
  });
}
