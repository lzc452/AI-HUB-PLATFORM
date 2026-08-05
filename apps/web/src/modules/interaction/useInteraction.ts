import { useMutation, useQueryClient } from "@tanstack/react-query";

import { rateApplication, toggleLike } from "./interaction.client";

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["catalog"] });
}

export function useToggleLike(applicationId: string | undefined) {
  const invalidateCatalog = useInvalidateCatalog();
  return useMutation({
    mutationFn: () => toggleLike(applicationId as string),
    onSuccess: invalidateCatalog,
  });
}

export function useRateApplication(applicationId: string | undefined) {
  const invalidateCatalog = useInvalidateCatalog();
  return useMutation({
    mutationFn: (stars: number) =>
      rateApplication(applicationId as string, stars),
    onSuccess: invalidateCatalog,
  });
}
