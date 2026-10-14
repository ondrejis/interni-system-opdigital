"use client";

import type { EntityDescriptor } from "@rebar/core/shared";
import { PageHeader, RecordView, useNav } from "@rebar/ui";
import { useQuery } from "@tanstack/react-query";
import { TrackRecent } from "../recent";
import { useEntityApi } from "@rebar/ui";

/** Plná stránka záznamu na vlastní adrese (`<seznam>/<id>`). */
export function RecordPage({
  entity,
  id,
  initialTab,
  initialSub,
}: {
  entity: EntityDescriptor;
  id: string;
  initialTab?: string | undefined;
  initialSub?: string | undefined;
}) {
  const nav = useNav();
  const api = useEntityApi();
  const record = useQuery({
    queryKey: ["entity", entity.key, "record", id],
    queryFn: () => api.get(entity.key, id),
  });
  const title = String(record.data?.row[entity.titleKey] ?? "");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        breadcrumbs={[{ label: entity.label.many, href: entity.listPath }, { label: title || "…" }]}
      />
      {title && (
        <TrackRecent href={`${entity.listPath}/${id}`} title={title} label={entity.label.one} />
      )}
      <RecordView
        entity={entity}
        id={id}
        mode="page"
        initialTab={initialTab}
        initialSub={initialSub}
        onDeleted={() => nav.push(entity.listPath)}
      />
    </div>
  );
}
