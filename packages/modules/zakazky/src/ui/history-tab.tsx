"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Button,
  EmptyState,
  Skeleton,
  Textarea,
  errorToast,
  useEntityApi,
  type ActivityResult,
} from "@rebar/ui";
import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LoadError } from "./parts";

/** Záložka Historie: změny zakázky a komentáře od nejnovějších; komentář jde přidat (bez upozornění, jen záznam). */
export function JobHistoryTab({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const api = useEntityApi();
  const [data, setData] = useState<ActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .activity("job", jobId)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, jobId]);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-32" />;
  return (
    <div className="space-y-4" data-testid="job-history">
      {canWrite && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            setBusy(true);
            api
              .addComment("job", jobId, body)
              .then(() => {
                setText("");
                load();
              })
              .catch((err: Error) => errorToast(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <Textarea
            aria-label="Nový komentář"
            placeholder="Napsat komentář…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>
            Přidat komentář
          </Button>
        </form>
      )}
      {data.timeline.length === 0 ? (
        <EmptyState icon={<History />} title="Zatím žádná historie" />
      ) : (
        <ol className="space-y-3">
          {data.timeline.map((t) => (
            <li key={`${t.kind}-${t.id}`} className="rounded-lg border border-line p-3">
              <p className="text-sm text-muted">
                <strong className="text-fg">{t.actor}</strong> · {formatInstant(t.at)}
              </p>
              {t.kind === "comment" ? (
                <p className="mt-1 whitespace-pre-wrap">{t.body}</p>
              ) : (
                <>
                  <p className="mt-1">{t.summary ?? t.action}</p>
                  {t.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-sm text-muted">
                      {t.changes.map((c, i) => (
                        <li key={i}>
                          {c.field}: {String(c.old ?? "—")} → {String(c.new ?? "—")}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
