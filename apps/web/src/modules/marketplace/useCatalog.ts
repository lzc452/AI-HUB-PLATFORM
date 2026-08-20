import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";
import {
  getCatalogEntry,
  getRiskDescription,
  listCategories,
  listVersions,
  saveRiskDescription,
  searchCatalog,
  type CatalogSearchParams,
} from "./marketplace.client";

export function useCatalogCategories() {
  return useQuery({
    queryFn: listCategories,
    queryKey: ["catalog", "categories"],
  });
}

export function useCatalogSearch(params: CatalogSearchParams) {
  return useQuery({
    queryFn: () => searchCatalog(params),
    queryKey: ["catalog", "search", params],
  });
}

export function useCatalogEntry(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getCatalogEntry(applicationId as string),
    queryKey: ["catalog", "entry", applicationId],
  });
}

export function useVersions(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => listVersions(applicationId as string),
    queryKey: ["catalog", "versions", applicationId],
  });
}

export function useRiskDescription(applicationId: string | undefined) {
  return useQuery({
    enabled: Boolean(applicationId),
    queryFn: () => getRiskDescription(applicationId as string),
    queryKey: ["catalog", "risk", applicationId],
  });
}

export function useSaveRiskDescription(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (riskDescription: string) =>
      saveRiskDescription(applicationId as string, riskDescription),
    onError: (error) => showErrorMessage(error, "保存风险说明失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["catalog", "risk", applicationId],
      });
      showSuccessMessage("风险说明已保存");
    },
  });
}
