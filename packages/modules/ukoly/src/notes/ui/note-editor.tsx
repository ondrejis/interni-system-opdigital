"use client";

import {
  Button,
  Icon,
  IconButton,
  Input,
  cn,
  errorToast,
  successToast,
  useEntityApi,
} from "@rebar/ui";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Autosaver, type AutosaveState, type SaveOutcome } from "../autosave";
import type { CreateNoteInput, NoteDto, SaveNoteResult } from "../contract";
import { emptyNoteDoc, sanitizeNoteDoc, type NoteDoc } from "../doc";
import { NOTE_PROSE } from "./note-view";

/** Vazba nové poznámky (záznam, ke kterému patří); bez ní je poznámka samostatná. */
export type NoteLinkInput = Pick<CreateNoteInput, "dealId" | "companyId" | "personId" | "jobId">;

type Payload = { title: string | undefined; doc: NoteDoc };

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto", "tel"],
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

/** Návrh neuloženého textu v prohlížeči (záloha pro případ, že zápis na server selže a stránka se zavře). */
type Draft = { version: number; title: string | undefined; doc: NoteDoc; at: number };
const draftKey = (id: string) => `opsys.note-draft.${id}`;
const readDraft = (id: string): Draft | null => {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};
const writeDraft = (id: string, d: Draft | null) => {
  try {
    if (d) window.localStorage.setItem(draftKey(id), JSON.stringify(d));
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    /* úložiště nemusí být k dispozici (soukromé okno) */
  }
};

/** Popisek stavu ukládání pro uživatele. */
export function saveStatusLabel(s: Pick<AutosaveState<unknown>, "status" | "failures">): string {
  switch (s.status) {
    case "dirty":
      return "Neuloženo…";
    case "saving":
      return "Ukládám…";
    case "saved":
      return "Uloženo";
    case "error":
      return s.failures > 1 ? "Nepodařilo se uložit, zkouším znovu" : "Nepodařilo se uložit";
    case "conflict":
      return "Poznámku mezitím někdo změnil";
    default:
      return "";
  }
}

function ToolButton({
  label,
  icon,
  text,
  active,
  onClick,
  disabled,
}: {
  label: string;
  /** Ikona z `Icon`, nebo `text` (zkratka tlačítka, když ikona není). */
  icon?: string;
  text?: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <IconButton
      label={label}
      variant="ghost"
      size="sm"
      aria-pressed={active ?? false}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-bg-active text-fg")}
    >
      {icon ? (
        <Icon name={icon} />
      ) : (
        <span className="text-sm font-semibold leading-none">{text}</span>
      )}
    </IconButton>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
    }),
  });
  const c = () => editor.chain().focus();
  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresa odkazu (prázdné odkaz odstraní):", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }
  return (
    <div
      role="toolbar"
      aria-label="Formátování poznámky"
      className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1"
      data-testid="note-toolbar"
    >
      <ToolButton
        label="Nadpis 1"
        text="H1"
        active={s.h1}
        onClick={() => c().toggleHeading({ level: 1 }).run()}
      />
      <ToolButton
        label="Nadpis 2"
        text="H2"
        active={s.h2}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        label="Nadpis 3"
        text="H3"
        active={s.h3}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <ToolButton label="Tučně" text="B" active={s.bold} onClick={() => c().toggleBold().run()} />
      <ToolButton
        label="Kurzíva"
        text="I"
        active={s.italic}
        onClick={() => c().toggleItalic().run()}
      />
      <ToolButton
        label="Přeškrtnuté"
        text="S"
        active={s.strike}
        onClick={() => c().toggleStrike().run()}
      />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <ToolButton
        label="Odrážky"
        text="•"
        active={s.bullet}
        onClick={() => c().toggleBulletList().run()}
      />
      <ToolButton
        label="Číslovaný seznam"
        text="1."
        active={s.ordered}
        onClick={() => c().toggleOrderedList().run()}
      />
      <ToolButton
        label="Checklist"
        icon="list-todo"
        active={s.task}
        onClick={() => c().toggleTaskList().run()}
      />
      <ToolButton
        label="Citace"
        text="❝"
        active={s.quote}
        onClick={() => c().toggleBlockquote().run()}
      />
      <ToolButton
        label="Kód"
        text="</>"
        active={s.code}
        onClick={() => c().toggleCodeBlock().run()}
      />
      <ToolButton label="Odkaz" icon="link" active={s.link} onClick={setLink} />
    </div>
  );
}

/** Stav ukládání pod editorem; při konfliktu nabídne rozhodnutí. */
function StatusBar({
  state,
  onOverwrite,
  onTakeTheirs,
  onRetry,
}: {
  state: AutosaveState<NoteDto>;
  onOverwrite: () => void;
  onTakeTheirs: () => void;
  onRetry: () => void;
}) {
  const label = saveStatusLabel(state);
  return (
    <div className="border-t border-line px-3 py-1.5 text-sm" aria-live="polite">
      {state.status === "conflict" ? (
        <div
          role="alert"
          data-testid="note-conflict"
          className="flex flex-wrap items-center gap-2 text-danger"
        >
          <span>
            Poznámku mezitím změnil
            {state.conflict?.updatedByName ? ` ${state.conflict.updatedByName}` : " někdo jiný"}.
            Vaše změny zatím nejsou uložené.
          </span>
          <Button size="sm" variant="primary" onClick={onOverwrite}>
            Přepsat mou verzí
          </Button>
          <Button size="sm" onClick={onTakeTheirs}>
            Načíst jejich verzi
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            data-testid="note-save-status"
            data-status={state.status}
            className={cn(
              "text-faint",
              state.status === "error" && "text-danger",
              state.status === "saved" && "text-muted",
            )}
          >
            {label}
          </span>
          {state.status === "error" && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Zkusit znovu
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Editor poznámky (Tiptap) s automatickým ukládáním po 800 ms klidu. Bez `note` zakládá novou poznámku při první změně
 * (prázdná se nezaloží) s vazbou `link`; s `note` ji upravuje. Hlídá souběh (verze, konflikt s volbou), selhání (opakuje,
 * drží text a zálohuje ho v prohlížeči) a při opuštění stránky uloží, co čeká.
 */
export function NoteEditor({
  note,
  link,
  isPrivate,
  autoFocus,
  onSaved,
  onCreated,
  onDone,
  className,
}: {
  note?: NoteDto;
  link?: NoteLinkInput;
  isPrivate?: boolean;
  autoFocus?: boolean;
  /** Po každém úspěšném zápisu (nová verze poznámky). */
  onSaved?: (n: NoteDto) => void;
  /** Po založení nové poznámky (první zápis). */
  onCreated?: (n: NoteDto) => void;
  /** Tlačítko „Hotovo“ (uloží a zavře editor). */
  onDone?: () => void;
  className?: string;
}) {
  const api = useEntityApi();
  const idRef = useRef<string | null>(note?.id ?? null);
  const titleRef = useRef<string | undefined>(undefined);
  const [title, setTitle] = useState(note?.title ?? "");
  const [state, setState] = useState<AutosaveState<NoteDto> | null>(null);
  const cb = useRef({ onSaved, onCreated, link, isPrivate });
  cb.current = { onSaved, onCreated, link, isPrivate };

  const saver = useMemo(
    () =>
      new Autosaver<Payload, NoteDto>({
        baseVersion: note?.version ?? 1,
        onState: (s) => {
          setState(s);
          if (s.status === "saved" && idRef.current) writeDraft(idRef.current, null);
        },
        save: async (p, { baseVersion, force }): Promise<SaveOutcome<NoteDto>> => {
          const bodyJson = p.doc as unknown as Record<string, unknown>;
          if (!idRef.current) {
            const n = await api.command<CreateNoteInput, NoteDto>("ukoly.note.create", {
              ...(p.title ? { title: p.title } : {}),
              bodyJson,
              ...cb.current.link,
              ...(cb.current.isPrivate ? { isPrivate: true } : {}),
            });
            idRef.current = n.id;
            cb.current.onCreated?.(n);
            return { status: "saved", version: n.version, value: n };
          }
          const r = await api.command<unknown, SaveNoteResult>("ukoly.note.save", {
            id: idRef.current,
            baseVersion,
            bodyJson,
            ...(p.title !== undefined ? { title: p.title } : {}),
            ...(force ? { force: true } : {}),
          });
          if (r.status === "conflict")
            return { status: "conflict", version: r.note.version, value: r.note };
          cb.current.onSaved?.(r.note);
          return { status: "saved", version: r.note.version, value: r.note };
        },
      }),
    // jeden řadič na poznámku; `api.command` se nemění
    [],
  );

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: (note?.bodyJson ?? emptyNoteDoc()) as never,
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        "data-testid": "note-editor",
        "aria-label": "Text poznámky",
        class: cn("min-h-28 px-3 py-2 outline-none", NOTE_PROSE),
      },
    },
    onUpdate: ({ editor: e }) => {
      let doc: NoteDoc;
      try {
        doc = sanitizeNoteDoc(e.getJSON()).doc;
      } catch (err) {
        errorToast((err as Error).message);
        return;
      }
      const payload = { title: titleRef.current, doc };
      saver.change(payload);
      if (idRef.current)
        writeDraft(idRef.current, {
          version: saver.state.baseVersion,
          title: titleRef.current,
          doc,
          at: Date.now(),
        });
    },
  });

  // obnoví neuložený text z prohlížeče (stránka se zavřela dřív, než se zápis podařil)
  useEffect(() => {
    if (!editor || !note) return;
    const d = readDraft(note.id);
    if (!d || d.version !== note.version) return writeDraft(note.id, null);
    if (JSON.stringify(d.doc) === JSON.stringify(note.bodyJson ?? emptyNoteDoc()))
      return writeDraft(note.id, null);
    editor.commands.setContent(d.doc as never);
    if (d.title !== undefined) {
      titleRef.current = d.title;
      setTitle(d.title);
    }
    saver.change({ title: d.title, doc: d.doc });
    successToast("Obnoven neuložený text poznámky.");
  }, [editor, note, saver]);

  // uložit při opuštění: zavření okna, skrytí záložky, odchod ze stránky
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.hasUnsaved) {
        void saver.flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void saver.flush(); // čekající text se uloží i po odchodu (opakování po chybě běží dál)
    };
  }, [saver]);

  function onTitle(v: string) {
    setTitle(v);
    titleRef.current = v;
    if (editor) {
      try {
        saver.change({ title: v, doc: sanitizeNoteDoc(editor.getJSON()).doc });
      } catch (err) {
        errorToast((err as Error).message);
      }
    }
  }

  function takeTheirs() {
    const theirs = state?.conflict;
    if (!theirs || !editor) return;
    editor.commands.setContent((theirs.bodyJson ?? emptyNoteDoc()) as never);
    titleRef.current = undefined;
    setTitle(theirs.title ?? "");
    saver.accept(theirs.version);
    cb.current.onSaved?.(theirs);
  }

  async function done() {
    await saver.flush();
    if (saver.state.status === "error" || saver.state.status === "conflict") {
      errorToast("Poznámka ještě není uložená. Vyřešte to před zavřením.");
      return;
    }
    onDone?.();
  }

  return (
    <div
      data-testid="note-editor-card"
      className={cn("overflow-hidden rounded-md border border-line bg-bg", className)}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <Input
          aria-label="Název poznámky"
          placeholder="Název (jinak první řádek textu)"
          value={title}
          maxLength={200}
          onChange={(e) => onTitle(e.target.value)}
          className="h-7 border-0 bg-transparent px-0 font-medium shadow-none focus:ring-0"
        />
        {onDone && (
          <Button size="sm" variant="primary" onClick={() => void done()}>
            Hotovo
          </Button>
        )}
      </div>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {state && (
        <StatusBar
          state={state}
          onOverwrite={() => void saver.overwrite()}
          onTakeTheirs={takeTheirs}
          onRetry={() => void saver.retry()}
        />
      )}
    </div>
  );
}
