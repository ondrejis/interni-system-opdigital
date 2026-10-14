"use client";

import type { EntityDescriptor, FilterGroup } from "@rebar/core/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "../components/badges";
import { EntityList } from "./entity-list";
import { useEntityApi } from "./context";

/**
 * Související záznamy uvnitř detailu (vady zakázky, osoby firmy…): stejný seznam jako jinde (inline editace, panel,
 * vytvoření), jen s pevným filtrem na rodiče a předvyplněným rodičem při vytvoření.
 */
export function RelatedRecords({
  entity,
  parentAttribute,
  parentId,
  height = 420,
}: {
  entity: string;
  /** Klíč atributu typu záznam, který odkazuje na rodiče (např. `job`). */
  parentAttribute: string;
  parentId: string;
  height?: number;
}) {
  const api = useEntityApi();
  const descriptor = useQuery<EntityDescriptor>({
    queryKey: ["entity-descriptor", entity],
    queryFn: () => api.describe(entity),
    staleTime: 5 * 60_000,
  });
  const baseFilters = useMemo<FilterGroup>(
    () => ({ op: "and", conditions: [{ attr: parentAttribute, op: "is", value: parentId }] }),
    [parentAttribute, parentId],
  );
  const defaults = useMemo(() => ({ [parentAttribute]: parentId }), [parentAttribute, parentId]);
  if (descriptor.isLoading || !descriptor.data) return <Skeleton className="h-24" />;
  return (
    <div className="-mx-5 flex flex-col overflow-hidden border-y border-line" style={{ height }}>
      <EntityList
        entity={descriptor.data}
        baseFilters={baseFilters}
        createDefaults={defaults}
        compact
      />
    </div>
  );
}
