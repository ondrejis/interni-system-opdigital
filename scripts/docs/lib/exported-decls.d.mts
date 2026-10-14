export const REQUIRED_KINDS: string[];
export function jsdocDescription(value: string): string;
export function leadingDescription(
  node: { range: [number, number] },
  comments: { type: string; value: string; range: [number, number] }[],
  text: string,
): string | null;
export type ExportedDeclaration = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "enum" | "component" | "value";
  documented: boolean;
  node: object;
  line: number;
};
export function exportedDeclarations(
  ast: object,
  text: string,
  filename: string,
): ExportedDeclaration[];
