"use client";

import { CLIENT_TABS } from "@rebar/core/contracts";
import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Skeleton,
  defineModuleUi,
  useCommandQuery,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import type { NoteDto } from "../contract";
import { NoteEditor } from "./note-editor";
import { NoteView } from "./note-view";
import { NotesPanel } from "./notes-panel";

type LinkType = "deal" | "company" | "person" | "job";
const LINK_TYPES: readonly LinkType[] = ["company", "person", "deal", "job"];

/** Záložka „Poznámky“ na kartě záznamu (D §2.5: pořadí z `CLIENT_TABS`). */
const tabFor = (type: LinkType): RecordTab => ({
  id: "poznamky",
  label: "Poznámky",
  permission: "ukoly.read",
  order: CLIENT_TABS.poznamky,
  icon: "file-text",
  render: ({ id }) => <NotesPanel key={id} link={{ type, id }} />,
});

/** Akce hlavičky „Nová poznámka“: dialog s editorem (poznámka se založí při prvním psaní). */
const actionFor = (type: LinkType): RecordAction => ({
  id: "note.new",
  label: "Nová poznámka",
  permission: "ukoly.create",
  dialog: {
    title: "Nová poznámka",
    render: ({ id, close }) => <NoteEditor link={{ [`${type}Id`]: id }} autoFocus onDone={close} />,
  },
});

/** Editor poznámky na její vlastní stránce (`/poznamky/<id>`); bez práva úpravy jen čtení. */
function NoteRecordCard({ id }: { id: string }) {
  const q = useCommandQuery<NoteDto, { id: string }>("ukoly.note.get", { id });
  return (
    <Card aria-label="Text poznámky">
      <CardHeader title="Text" />
      <CardBody>
        {q.isLoading ? (
          <Skeleton className="h-40" />
        ) : q.data ? (
          q.data.canWrite ? (
            <NoteEditor key={q.data.id} note={q.data} />
          ) : (
            <NoteView doc={q.data.bodyJson} />
          )
        ) : (
          <p className="text-sm text-danger">Poznámku se nepodařilo načíst.</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Stránka samostatných poznámek (`/poznamky/samostatne`; bez položky v navigaci, R-23: Cmd+K a Můj prostor → Soukromé). */
function StandaloneNotesPage({ query }: { query: Record<string, string> }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Poznámky" }]} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto max-w-3xl">
          <NotesPanel standalone startNew={query.nova === "1"} />
        </div>
      </div>
    </div>
  );
}

/** UI oblasti „notes“ modulu „ukoly“ (UKO-11): záložky poznámek, akce, editor na stránce poznámky, seznam samostatných a paleta. */
export const notesUi = defineModuleUi({
  recordTabs: Object.fromEntries(LINK_TYPES.map((t) => [t, [tabFor(t)]])),
  recordActions: Object.fromEntries(LINK_TYPES.map((t) => [t, [actionFor(t)]])),
  recordOverview: {
    note: [
      {
        id: "note-body",
        column: "main" as const,
        order: 0,
        permission: "ukoly.read",
        render: ({ id }: { id: string }) => <NoteRecordCard id={id} />,
      },
    ],
  },
  pages: [
    {
      path: "/poznamky/samostatne",
      render: ({ query }: { query: Record<string, string> }) => (
        <StandaloneNotesPage query={query} />
      ),
    },
  ],
  paletteActions: [
    {
      id: "ukoly.note.new",
      label: "Nová poznámka",
      keywords: "poznámka zápis note nová",
      icon: "file-text",
      permission: "ukoly.create",
      href: "/poznamky/samostatne?nova=1",
    },
    {
      id: "ukoly.note.list",
      label: "Poznámky",
      keywords: "poznámky samostatné zápisy notes",
      icon: "file-text",
      permission: "ukoly.read",
      href: "/poznamky/samostatne",
    },
  ],
});
