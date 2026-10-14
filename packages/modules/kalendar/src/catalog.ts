// Číselníky modulu bez serverových závislostí, aby je mohlo číst i rozhraní v prohlížeči.

export const EVENT_TYPES = [
  { value: "meeting", label: "Schůzka", color: "blue" },
  { value: "survey", label: "Zaměření / ohledání", color: "orange" },
  { value: "handover", label: "Předání", color: "green" },
  { value: "other", label: "Jiné", color: "gray" },
] as const;
export const EVENT_TYPE_VALUES = EVENT_TYPES.map((t) => t.value) as [string, ...string[]];

export const RESOURCE_KINDS = [
  { value: "room", label: "Místnost" },
  { value: "equipment", label: "Vybavení" },
  { value: "other", label: "Jiné" },
] as const;
