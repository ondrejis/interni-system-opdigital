import type { AttributeType } from "./types";

// Čistá data bez závislostí na databázi — importuje je i prohlížeč (nabídka operátorů ve filtru).

export const OPERATORS = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "before",
  "after",
  "in_last_days",
  "in_next_days",
  "older_than_days",
  "in_this_week",
  "in_this_month",
  "is",
  "is_not",
  "is_any_of",
  "is_none_of",
  "is_me",
  "is_not_me",
  "contains_any",
  "contains_all",
  "empty",
  "not_empty",
  "is_true",
  "is_false",
] as const;
export type Operator = (typeof OPERATORS)[number];

const TEXT_OPS: Operator[] = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "empty",
  "not_empty",
];
const NUM_OPS: Operator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "empty",
  "not_empty",
];

/** Operátory dostupné pro typ atributu (z toho se staví nabídka ve filtru). */
export const OPERATORS_BY_TYPE: Record<AttributeType, Operator[]> = {
  text: TEXT_OPS,
  longtext: TEXT_OPS,
  email: TEXT_OPS,
  phone: TEXT_OPS,
  url: TEXT_OPS,
  number: NUM_OPS,
  currency: NUM_OPS,
  date: [
    "eq",
    "before",
    "after",
    "between",
    "in_last_days",
    "in_next_days",
    "older_than_days",
    "in_this_week",
    "in_this_month",
    "empty",
    "not_empty",
  ],
  status: ["is", "is_not", "is_any_of", "is_none_of", "empty", "not_empty"],
  select: ["is", "is_not", "is_any_of", "is_none_of", "empty", "not_empty"],
  record: ["is", "is_not", "is_any_of", "is_none_of", "empty", "not_empty"],
  user: ["is", "is_not", "is_any_of", "is_none_of", "is_me", "is_not_me", "empty", "not_empty"],
  multiselect: ["contains_any", "contains_all", "empty", "not_empty"],
  checkbox: ["is_true", "is_false"],
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "obsahuje",
  not_contains: "neobsahuje",
  equals: "je přesně",
  not_equals: "není přesně",
  starts_with: "začíná na",
  eq: "je rovno",
  neq: "není rovno",
  gt: "je větší než",
  gte: "je alespoň",
  lt: "je menší než",
  lte: "je nejvýš",
  between: "je mezi",
  before: "je před",
  after: "je po",
  in_last_days: "v posledních dnech",
  in_next_days: "v příštích dnech",
  older_than_days: "je starší než (dní)",
  in_this_week: "je tento týden",
  in_this_month: "je tento měsíc",
  is: "je",
  is_not: "není",
  is_any_of: "je jedno z",
  is_none_of: "není žádné z",
  is_me: "jsem já",
  is_not_me: "nejsem já",
  contains_any: "obsahuje některé z",
  contains_all: "obsahuje všechny",
  empty: "je prázdné",
  not_empty: "není prázdné",
  is_true: "je zaškrtnuto",
  is_false: "není zaškrtnuto",
};

/** Operátory bez hodnoty (hodnotu uživatel nezadává). */
export const VALUELESS_OPERATORS: readonly Operator[] = [
  "empty",
  "not_empty",
  "is_me",
  "is_not_me",
  "is_true",
  "is_false",
  "in_this_week",
  "in_this_month",
];

export type Condition = { attr: string; op: Operator; value?: unknown };
export type FilterGroup = { op: "and" | "or"; conditions: (Condition | FilterGroup)[] };
