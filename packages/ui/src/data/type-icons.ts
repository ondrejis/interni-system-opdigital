import {
  AlignLeft,
  Banknote,
  Calendar,
  CircleDot,
  Globe,
  Hash,
  Link2,
  Mail,
  Phone,
  SquareCheck,
  Tags,
  Type,
  User,
  ChevronDownCircle,
  type LucideIcon,
} from "lucide-react";
import type { AttributeType } from "@rebar/core/shared";

/** Ikona typu atributu — v záhlaví sloupce, ve filtrech a v panelu atributů. */
export const TYPE_ICONS: Record<AttributeType, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  number: Hash,
  currency: Banknote,
  date: Calendar,
  status: CircleDot,
  select: ChevronDownCircle,
  multiselect: Tags,
  user: User,
  record: Link2,
  checkbox: SquareCheck,
  url: Globe,
  phone: Phone,
  email: Mail,
};

/** Podle kterých typů jde seskupovat (shoda s engine). */
export const GROUPABLE: readonly AttributeType[] = [
  "status",
  "select",
  "user",
  "record",
  "checkbox",
];
