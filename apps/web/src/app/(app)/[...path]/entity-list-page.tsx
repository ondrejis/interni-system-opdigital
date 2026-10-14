"use client";

import type { EntityDescriptor } from "@rebar/core/shared";
import { EntityList } from "@rebar/ui";

export function EntityListPage({
  entity,
  viewId,
  openCreate,
  exportTemplate,
}: {
  entity: EntityDescriptor;
  viewId?: string;
  openCreate?: boolean;
  exportTemplate?: string;
}) {
  return (
    <EntityList
      entity={entity}
      initialViewId={viewId}
      autoOpenCreate={openCreate}
      initialExportTemplate={exportTemplate}
    />
  );
}
