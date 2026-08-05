import { useQuery } from "@tanstack/react-query";

import { fetchActor, listDepartments, listEmployees } from "./auth.client";

export function useActor() {
  return useQuery({
    queryFn: fetchActor,
    queryKey: ["identity", "actor"],
  });
}

export function useEmployees() {
  return useQuery({
    queryFn: listEmployees,
    queryKey: ["identity", "employees"],
  });
}

export function useDepartments() {
  return useQuery({
    queryFn: listDepartments,
    queryKey: ["identity", "departments"],
  });
}
