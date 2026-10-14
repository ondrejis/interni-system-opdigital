"use client";

import type { DashboardFilters, DashboardWidget } from "@rebar/core/dashboards-shared";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Component, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Button, IconButton } from "../components/button";
import { Skeleton } from "../components/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/overlay";
import { errorToast } from "../components/toast";
import { cn } from "../lib/cn";
import { dashKeys, useDashboardApi } from "./api";
import { WidgetBody } from "./widget-body";

/** Chyba vykreslení jednoho widgetu nerozbije nástěnku: ukáže hlášku a možnost zkusit znovu. */
class WidgetBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex items-start gap-2 text-sm text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          Widget „{this.props.title}“ se nepodařilo zobrazit.
          <button
            type="button"
            className="ml-2 text-accent-text underline"
            onClick={() => this.setState({ failed: false })}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }
}

type Props = {
  widget: DashboardWidget;
  filters: DashboardFilters;
  refreshKey: number;
  /** Obnovovat data každých N ms (režim pro TV). */
  autoRefreshMs?: number | undefined;
  editing?: boolean;
  onEdit?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  /** Atributy a posluchače uchopení pro přetahování (dnd-kit). */
  dragProps?: HTMLAttributes<HTMLButtonElement> | undefined;
  /** Tlačítko pro změnu velikosti (ve spodním rohu v režimu úprav). */
  resizeHandle?: ReactNode;
  nodeRef?: Ref<HTMLElement> | undefined;
  style?: React.CSSProperties | undefined;
  className?: string | undefined;
  /** Bez nabídky exportu (TV režim, tisk). */
  hideMenu?: boolean | undefined;
};

/** Karta widgetu: záhlaví s nabídkou, načítání, chyba (česká hláška), obsah. Načítá se samostatně a souběžně s ostatními. */
export function WidgetCard({
  widget,
  filters,
  refreshKey,
  autoRefreshMs,
  editing,
  onEdit,
  onRemove,
  dragProps,
  resizeHandle,
  nodeRef,
  style,
  className,
  hideMenu,
}: Props) {
  const api = useDashboardApi();
  const q = useQuery({
    queryKey: dashKeys.widget(widget, filters, refreshKey),
    queryFn: () => api.evaluate(widget, filters, refreshKey > 0 ? { fresh: true } : {}),
    staleTime: 20_000,
    refetchInterval: autoRefreshMs ?? false,
    placeholderData: (prev) => prev,
  });
  const outcome = q.data;

  async function download(format: "csv" | "xlsx") {
    try {
      await api.exportWidget(widget, filters, format);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <section
      ref={nodeRef as Ref<HTMLElement>}
      aria-label={widget.title}
      data-testid="widget-card"
      data-widget-id={widget.id}
      className={cn(
        "relative flex min-h-0 flex-col rounded-lg border border-line bg-bg p-3",
        editing && "ring-1 ring-[var(--accent-line)]",
        className,
      )}
      style={style}
    >
      <header className="mb-2 flex items-center gap-1.5">
        {editing && (
          <button
            type="button"
            aria-label={`Přesunout widget „${widget.title}“`}
            className="-ml-1 cursor-grab touch-none rounded p-0.5 text-faint hover:bg-hover hover:text-fg active:cursor-grabbing"
            data-testid="widget-drag"
            {...dragProps}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-muted">{widget.title}</h3>
        {editing ? (
          <>
            <IconButton
              label="Upravit widget"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              data-testid="widget-edit"
            >
              <Pencil />
            </IconButton>
            <IconButton
              label="Odebrat widget"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              data-testid="widget-remove"
            >
              <Trash2 />
            </IconButton>
          </>
        ) : (
          !hideMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  label="Nabídka widgetu"
                  variant="ghost"
                  size="sm"
                  data-testid="widget-menu"
                >
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void q.refetch()}>
                  <RefreshCw className="size-4" /> Obnovit
                </DropdownMenuItem>
                {outcome?.ok && widget.source.kind !== "builtin" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Stáhnout data</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void download("csv")}>
                      <Download className="size-4" /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void download("xlsx")}>
                      <Download className="size-4" /> Excel (XLSX)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={q.isFetching} tabIndex={0}>
        {q.isPending ? (
          <div className="space-y-2" role="status" aria-label="Načítám">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : q.isError ? (
          <WidgetError
            message="Widget se nepodařilo načíst. Zkontrolujte připojení."
            onRetry={() => void q.refetch()}
          />
        ) : outcome && !outcome.ok ? (
          outcome.code === "forbidden" ? (
            <p
              className={cn(
                "flex items-start gap-2 text-sm text-muted",
                widget.h <= 1 && "line-clamp-2",
              )}
              data-testid="widget-forbidden"
              title={outcome.error}
            >
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {outcome.error}
            </p>
          ) : (
            <WidgetError
              message={outcome.error}
              compact={widget.h <= 1}
              onRetry={() => void q.refetch()}
            />
          )
        ) : outcome?.ok ? (
          <WidgetBoundary title={widget.title}>
            <WidgetBody result={outcome.result} title={widget.title} h={widget.h} />
            {outcome.result.meta.truncated && (
              <p className="mt-1 text-xs text-faint">
                Zobrazena je jen část výsledků (limit widgetu).
              </p>
            )}
          </WidgetBoundary>
        ) : null}
      </div>
      {resizeHandle}
    </section>
  );
}

function WidgetError({
  message,
  onRetry,
  compact,
}: {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 text-sm"
      data-testid="widget-error"
    >
      <p
        className={cn("flex items-start gap-2 text-danger", compact && "line-clamp-2")}
        title={message}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {message}
      </p>
      {!compact && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Zkusit znovu
        </Button>
      )}
    </div>
  );
}
