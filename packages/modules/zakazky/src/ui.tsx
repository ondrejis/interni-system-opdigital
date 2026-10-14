"use client";

import { defineModuleUi, type RecordTab, RelatedRecords } from "@rebar/ui";
import * as lifecycle from "./lifecycle/ui";
import * as templates from "./templates/ui";
import { JobHeader } from "./detail/header";
import { OVERVIEW_CARDS } from "./detail/overview";

const relatedJobs = (parentAttribute: "company" | "person"): RecordTab => ({
  id: "zakazky",
  label: "Zakázky",
  permission: "zakazky.read",
  render: ({ id }) => (
    <RelatedRecords entity="job" parentAttribute={parentAttribute} parentId={id} />
  ),
});

const areas = [lifecycle, templates];

export const ui = defineModuleUi({
  recordTabs: {
    company: [relatedJobs("company")],
    person: [relatedJobs("person")],
    job: areas.flatMap((a) => a.tabs),
  },
  recordActions: {
    job: areas.flatMap((a) => a.actions),
  },
  recordHeader: { job: JobHeader },
  recordOverview: { job: OVERVIEW_CARDS },
  hiddenCoreTabs: { job: ["activity"] },
  pages: areas.flatMap((a) => a.pages),
});
