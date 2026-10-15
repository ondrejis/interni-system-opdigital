"use client";

import { createElement, type ReactNode } from "react";
import { cn } from "@rebar/ui";
import type { NoteDoc, NoteMark, NoteNode } from "../doc";

/**
 * Styl obsahu poznámky (stejný pro editor i čtení): Tailwind v projektu resetuje seznamy a nadpisy, proto se obnovují
 * tady. Selektory míří na uzly vykreslené Tiptapem (`.ProseMirror`) i na `NoteView`.
 */
export const NOTE_PROSE = cn(
  "text-base leading-relaxed text-fg break-words",
  "[&_p]:my-1.5 [&_p:empty]:min-h-5",
  "[&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-medium",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li>p]:my-0.5 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2",
  "[&_ul[data-type=taskList]_li>label]:mt-1 [&_ul[data-type=taskList]_li>div]:min-w-0 [&_ul[data-type=taskList]_li>div]:flex-1",
  "[&_li[data-checked=true]>div]:text-muted [&_li[data-checked=true]>div]:line-through",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-sunken [&_pre]:p-3 [&_pre]:text-sm",
  "[&_code]:rounded [&_code]:bg-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-accent [&_a]:underline [&_hr]:my-3 [&_hr]:border-line",
);

function markWrap(children: ReactNode, mark: NoteMark, key: string): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{children}</strong>;
    case "italic":
      return <em key={key}>{children}</em>;
    case "strike":
      return <s key={key}>{children}</s>;
    case "underline":
      return <u key={key}>{children}</u>;
    case "code":
      return <code key={key}>{children}</code>;
    case "link":
      return (
        <a key={key} href={mark.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
  }
}

function renderNode(n: NoteNode, key: string): ReactNode {
  const kids = (n.content ?? []).map((c, i) => renderNode(c, `${key}.${i}`));
  switch (n.type) {
    case "text": {
      let out: ReactNode = n.text ?? "";
      (n.marks ?? []).forEach((m, i) => {
        out = markWrap(out, m, `${key}.m${i}`);
      });
      return <span key={key}>{out}</span>;
    }
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{kids}</p>;
    case "heading":
      return createElement(`h${Number(n.attrs?.level) || 2}`, { key }, kids);
    case "bulletList":
      return <ul key={key}>{kids}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={typeof n.attrs?.start === "number" ? n.attrs.start : 1}>
          {kids}
        </ol>
      );
    case "taskList":
      return (
        <ul key={key} data-type="taskList">
          {kids}
        </ul>
      );
    case "listItem":
      return <li key={key}>{kids}</li>;
    case "taskItem":
      return (
        <li key={key} data-checked={n.attrs?.checked === true}>
          <label>
            <input type="checkbox" checked={n.attrs?.checked === true} disabled readOnly />
          </label>
          <div>{kids}</div>
        </li>
      );
    case "blockquote":
      return <blockquote key={key}>{kids}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{kids}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    default:
      return null;
  }
}

/**
 * Obsah poznámky jen pro čtení. Vykresluje se z JSON jako prvky Reactu (žádné `dangerouslySetInnerHTML`), text se
 * escapuje a odkazy jsou už na serveru omezené na bezpečná schémata.
 */
export function NoteView({ doc, className }: { doc: NoteDoc | null; className?: string }) {
  if (!doc || !doc.content.length) return null;
  return (
    <div data-testid="note-view" className={cn(NOTE_PROSE, className)}>
      {doc.content.map((n, i) => renderNode(n, String(i)))}
    </div>
  );
}
