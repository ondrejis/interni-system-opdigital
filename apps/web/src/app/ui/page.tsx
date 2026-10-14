import { notFound } from "next/navigation";
import { Showcase } from "./showcase";

export const metadata = { title: "Design system" };

/** Přehled komponent pro vývoj (v produkci neexistuje; e2e sestavení ho zapíná přes `UI_SHOWCASE=1`). */
export default function UiPage() {
  if (process.env.NODE_ENV === "production" && process.env.UI_SHOWCASE !== "1") notFound();
  return <Showcase />;
}
