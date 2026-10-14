import { and, eq, isNull, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import { ASSET_KINDS, ASSET_STATUSES, FUELS } from "./fleet";
import { asset, assetDefect, assetFuel, assetLog, assetReservation, assetService } from "./schema";

export const assetEntity = defineEntity({
  key: "asset",
  listPath: "/stroje/evidence",
  module: "stroje",
  label: { one: "Stroj nebo vozidlo", many: "Stroje a vozidla" },
  table: asset,
  titleKey: "name",
  permissions: { read: "stroje.read", write: "stroje.write" },
  ownerColumns: [asset.responsibleId],
  beforeCreate: async (_ctx, values) => ({
    ...values,
    ...(typeof values.plate === "string"
      ? { plate: values.plate.trim().toUpperCase() || null }
      : {}),
  }),
  afterUpdate: async (ctx, before, after) => {
    const id = String(after.id);
    if (typeof after.plate === "string" && after.plate !== after.plate.trim().toUpperCase())
      await ctx.db
        .update(asset)
        .set({ plate: after.plate.trim().toUpperCase() || null })
        .where(eq(asset.id, id));
    // stroj s otevřenou blokující závadou se nevrací do provozu ručně, ale vyřešením závady
    if (before.status !== "active" && after.status === "active") {
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(assetDefect)
        .where(
          and(
            eq(assetDefect.assetId, id),
            eq(assetDefect.status, "open"),
            eq(assetDefect.severity, "blocking"),
            isNull(assetDefect.deletedAt),
          ),
        );
      if (r?.n) throw new UserError("Stroj má otevřenou blokující závadu. Nejdřív ji vyřešte.");
    }
  },
  beforeDelete: async (ctx, raw) => {
    const id = String(raw.id);
    const [r] = await ctx.db.execute<{ n: number }>(sql`
      select (
        (select count(*) from ${assetLog} where ${assetLog.assetId} = ${id} and ${assetLog.deletedAt} is null) +
        (select count(*) from ${assetFuel} where ${assetFuel.assetId} = ${id} and ${assetFuel.deletedAt} is null) +
        (select count(*) from ${assetService} where ${assetService.assetId} = ${id} and ${assetService.deletedAt} is null) +
        (select count(*) from ${assetReservation} where ${assetReservation.assetId} = ${id} and ${assetReservation.deletedAt} is null) +
        (select count(*) from ${assetDefect} where ${assetDefect.assetId} = ${id} and ${assetDefect.deletedAt} is null)
      )::int as n`);
    if (r && r.n > 0)
      throw new UserError(
        "Karta má zápisy (jízdy, tankování, servis, rezervace nebo závady). Vyřaďte ji stavem „Vyřazeno“.",
      );
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Druh",
      type: "select",
      field: "kind",
      required: true,
      default: "van",
      choices: ASSET_KINDS.map((k) => ({ value: k.value, label: k.label })),
      width: 150,
      defaultVisible: true,
    },
    { key: "plate", label: "SPZ", type: "text", field: "plate", width: 110, defaultVisible: true },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      choices: ASSET_STATUSES.map((s) => ({ value: s.value, label: s.label, color: s.color })),
      width: 130,
      defaultVisible: true,
    },
    {
      key: "responsible",
      label: "Odpovídá",
      type: "user",
      field: "responsibleId",
      width: 170,
      defaultVisible: true,
    },
    {
      key: "meter",
      label: "Měří se v",
      type: "select",
      field: "meter",
      required: true,
      default: "km",
      choices: [
        { value: "km", label: "Kilometry" },
        { value: "mth", label: "Motohodiny" },
      ],
      width: 130,
    },
    {
      key: "meterValue",
      label: "Stav tachometru",
      type: "number",
      field: "meterValue",
      width: 140,
      defaultVisible: true,
    },
    {
      key: "stkDate",
      label: "STK do",
      type: "date",
      field: "stkDate",
      width: 120,
      defaultVisible: true,
    },
    { key: "insuranceDate", label: "Ručení do", type: "date", field: "insuranceDate", width: 120 },
    { key: "vignetteDate", label: "Známka do", type: "date", field: "vignetteDate", width: 120 },
    {
      key: "fuel",
      label: "Palivo",
      type: "select",
      field: "fuel",
      required: true,
      default: "diesel",
      choices: FUELS.map((f) => ({ value: f.value, label: f.label })),
      width: 110,
    },
    {
      key: "tankLiters",
      label: "Nádrž (l)",
      type: "number",
      field: "tankLiters",
      min: 0,
      max: 100_000,
      width: 100,
    },
    { key: "brand", label: "Značka", type: "text", field: "brand", width: 130 },
    { key: "model", label: "Model", type: "text", field: "model", width: 130 },
    {
      key: "year",
      label: "Rok výroby",
      type: "number",
      field: "year",
      min: 1900,
      max: 2100,
      width: 100,
    },
    { key: "vin", label: "VIN / výrobní číslo", type: "text", field: "vin", width: 190 },
    {
      key: "internalRate",
      permission: "stroje.write",
      label: "Interní sazba (za km / mth)",
      min: 0,
      type: "currency",
      field: "internalRateMinor",
      width: 190,
    },
    { key: "purchaseDate", label: "Pořízeno", type: "date", field: "purchaseDate", width: 120 },
    {
      key: "purchasePrice",
      permission: "stroje.write",
      label: "Pořizovací cena",
      min: 0,
      type: "currency",
      field: "purchasePriceMinor",
      width: 150,
    },
    { key: "fuelCard", label: "Palivová karta", type: "text", field: "fuelCard", width: 150 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 280 },
  ],
  search: (r) => ({
    title: String(r.name),
    ...(r.plate ? { subtitle: String(r.plate), extra: String(r.plate) } : {}),
  }),
  url: (id) => `/stroje/evidence/${id}`,
});

export const defectEntity = defineEntity({
  key: "asset_defect",
  listPath: "/stroje/zavady",
  module: "stroje",
  label: { one: "Závada", many: "Závady" },
  table: assetDefect,
  titleKey: "title",
  permissions: { read: "stroje.read", write: "stroje.write" },
  noCreate: "Závadu nahlaste tlačítkem „Nahlásit závadu“ na stránce Stroje.",
  noDelete: "Závady se nemažou, jsou součástí historie stroje. Označte je za vyřešené.",
  attributes: [
    {
      key: "title",
      label: "Závada",
      type: "text",
      field: "title",
      readonly: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "asset",
      label: "Stroj",
      type: "record",
      field: "assetId",
      record: { entityType: "asset" },
      readonly: true,
      width: 200,
      defaultVisible: true,
    },
    {
      key: "severity",
      label: "Závažnost",
      type: "select",
      field: "severity",
      readonly: true,
      choices: [
        { value: "normal", label: "Drobná, jezdí", color: "orange" },
        { value: "blocking", label: "Mimo provoz", color: "red" },
      ],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      readonly: true,
      choices: [
        { value: "open", label: "Otevřená", color: "red" },
        { value: "resolved", label: "Vyřešená", color: "green" },
      ],
      width: 120,
      defaultVisible: true,
    },
    {
      key: "reportedBy",
      label: "Nahlásil(a)",
      type: "user",
      field: "reportedBy",
      readonly: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "createdAt",
      label: "Nahlášeno",
      type: "date",
      field: "createdAt",
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 300 },
    {
      key: "resolution",
      label: "Řešení",
      type: "longtext",
      field: "resolution",
      readonly: true,
      width: 280,
    },
  ],
  search: (r) => ({ title: String(r.title) }),
  url: (id) => `/stroje/zavady/${id}`,
});

export const entities = [assetEntity, defectEntity];
