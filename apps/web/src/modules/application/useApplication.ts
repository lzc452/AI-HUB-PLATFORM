import { useQuery } from "@tanstack/react-query";

import {
  getApplication,
  getApplicationDeliveries,
  getApplicationReviews,
  getApplicationVersions,
  getCreatorSummary,
  getPublishedVersion,
} from "./application.client";

export function useApplication(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getApplication(applicationId as string),
    queryKey: ["applications", "detail", applicationId],
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
