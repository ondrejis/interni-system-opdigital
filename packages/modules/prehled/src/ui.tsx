"use client";

import { defineModuleUi } from "@rebar/ui";

/**
 * UI modulu „prehled“. Stránku `/prehled` vykresluje statická trasa aplikace (`apps/web/src/app/(app)/prehled`):
 * potřebuje server actions nástěnek, které modul nezná. Katalog widgetů je v `./presets`.
 */
export const ui = defineModuleUi({});
