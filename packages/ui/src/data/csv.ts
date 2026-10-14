import type { AttributeDescriptor, Labels, RecordRow } from "@rebar/core/shared";
import { plainValue } from "./cell";

/**
 * CSV pro Excel (středník, uvozovky u speciálních znaků, odřádkování CRLF, BOM kvůli češtině).
 * Sloupce jsou libovolné atributy včetně vlastních polí; hodnoty mají podobu jako v tabulce.
 */
export function buildCsv(
  columns: readonly AttributeDescriptor[],
  rows: readonly RecordRow[],
  labels: Labels,
): string {
  // texty začínající `=`, `+`, `-`, `@` by Excel vyhodnotil jako vzorec (CSV injection), proto dostanou apostrof
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const cell = (raw: string) => {
    const v = safe(raw);
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [
    columns.map((a) => cell(a.label)).join(";"),
    ...rows.map((r) => columns.map((a) => cell(plainValue(a, r[a.key], labels))).join(";")),
  ];
  return "﻿" + lines.join("\r\n");
}
