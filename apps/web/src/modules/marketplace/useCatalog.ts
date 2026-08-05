import { useQuery } from "@tanstack/react-query";

import {
  getCatalogEntry,
  searchCatalog,
  type CatalogSearchParams,
} from "./marketplace.client";

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
