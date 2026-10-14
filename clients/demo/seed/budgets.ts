import type { Ctx } from "@rebar/core/rbac";
import { type Kit } from "./kit";

type Kind = "labour" | "material" | "subcontract" | "machines" | "other";

/** Položka: [název, druh, jednotka, množství, nákladová cena za jednotku v Kč, prodejní cena za jednotku v Kč]. */
export type ItemDef = readonly [string, Kind, string, number, number, number];

export type SectionDef = { title: string; kind?: Kind; items: readonly ItemDef[] };
export type ObjectDef = { code: string; title: string; sections: readonly SectionDef[] };
export type BudgetDef = {
  /** Sazba DPH položek v setinách procenta (21 % = 2100, snížená 12 % = 1200). */
  vatBp?: number;
  /** Buď plochý seznam oddílů, nebo stavební objekty. */
  sections?: readonly SectionDef[];
  objects?: readonly ObjectDef[];
};

export type BuiltItem = { id: string; title: string; sectionId: string; section: string };
export type BuiltBudget = { items: BuiltItem[]; sections: Record<string, string> };

const kc = (n: number) => Math.round(n * 100);

/** Naplní verzi rozpočtu oddíly a položkami příkazy modulu Zakázky. */
export async function fillBudget(
  kit: Kit,
  ctx: Ctx,
  jobId: string,
  versionId: string,
  def: BudgetDef,
): Promise<BuiltBudget> {
  const out: BuiltBudget = { items: [], sections: {} };
  const vatRateBp = def.vatBp ?? 2100;
  const addSections = async (sections: readonly SectionDef[], objectId?: string) => {
    for (const s of sections) {
      const sec = await kit.run<{ id: string }>(ctx, "zakazky.budget.section.save", {
        versionId,
        ...(objectId ? { objectId } : {}),
        title: s.title,
        ...(s.kind ? { costCategory: s.kind } : {}),
      });
      out.sections[s.title] = sec.id;
      for (const [title, kind, unit, quantity, cost, price] of s.items) {
        const r = await kit.run<{ id: string }>(ctx, "zakazky.budget.item.save", {
          sectionId: sec.id,
          title,
          kind,
          unit,
          quantity,
          unitCostMinor: kc(cost),
          unitPriceMinor: kc(price),
          vatRateBp,
        });
        out.items.push({ id: r.id, title, sectionId: sec.id, section: s.title });
      }
    }
  };
  if (def.objects) {
    const tree = await kit.run<{
      objects: { id: string; isDefault: boolean }[];
    }>(ctx, "zakazky.budget.tree", { jobId, versionId });
    const first = tree.objects.find((o) => o.isDefault) ?? tree.objects[0];
    for (const [i, o] of def.objects.entries()) {
      let id: string;
      if (i === 0 && first) {
        // výchozí „Celá zakázka“ se stane prvním objektem
        await kit.run(ctx, "zakazky.budget.object.save", {
          id: first.id,
          code: o.code,
          title: o.title,
        });
        id = first.id;
      } else {
        id = (
          await kit.run<{ id: string }>(ctx, "zakazky.budget.object.save", {
            versionId,
            code: o.code,
            title: o.title,
          })
        ).id;
      }
      await addSections(o.sections, id);
    }
  } else await addSections(def.sections ?? []);
  return out;
}

/* ---------- rozpočty ukázkových zakázek ---------- */

export const BUDGETS: Record<string, BudgetDef> = {
  hala: {
    objects: [
      {
        code: "SO 01",
        title: "Skladová hala B",
        sections: [
          {
            title: "Zemní práce",
            kind: "machines",
            items: [
              ["Skrývka ornice tl. 180 mm", "machines", "m³", 420, 95, 150],
              ["Výkop základových patek", "machines", "m³", 310, 180, 260],
              ["Zásyp a hutnění po vrstvách", "machines", "m³", 260, 140, 210],
              ["Odvoz a uložení přebytečné zeminy", "machines", "m³", 520, 160, 230],
            ],
          },
          {
            title: "Základy",
            items: [
              ["Beton základových patek C25/30", "material", "m³", 185, 2650, 3200],
              ["Betonářská výztuž patek", "material", "t", 14, 24500, 29800],
              ["Bednění základových patek", "labour", "m²", 420, 380, 520],
              ["Základová deska s drátkobetonem", "subcontract", "m²", 2400, 1450, 1780],
            ],
          },
          {
            title: "Ocelová konstrukce",
            items: [
              ["Dodávka ocelové konstrukce haly", "material", "t", 96, 42000, 51500],
              ["Montáž ocelové konstrukce", "subcontract", "t", 96, 7800, 9900],
              ["Protikorozní nátěr konstrukce", "subcontract", "m²", 6200, 190, 260],
            ],
          },
          {
            title: "Opláštění",
            items: [
              ["Střešní sendvičové panely PIR 120", "material", "m²", 2650, 640, 810],
              ["Obvodové sendvičové panely", "material", "m²", 1800, 590, 750],
              ["Montáž opláštění", "labour", "m²", 4450, 210, 290],
              ["Světlíky pásové", "material", "ks", 18, 6800, 8900],
            ],
          },
          {
            title: "Podlahy a vrata",
            items: [
              ["Průmyslová podlaha, vsyp a zahlazení", "subcontract", "m²", 2400, 380, 495],
              ["Sekční vrata 4 × 4,5 m", "material", "ks", 6, 58000, 71500],
              ["Montáž sekčních vrat", "labour", "ks", 6, 6500, 9200],
            ],
          },
        ],
      },
      {
        code: "SO 02",
        title: "Zpevněné plochy a odvodnění",
        sections: [
          {
            title: "Komunikace",
            items: [
              ["Štěrkové lože frakce 0–63", "material", "m³", 820, 520, 690],
              ["Asfaltový koberec ACO 11", "subcontract", "m²", 3100, 610, 790],
              ["Obrubníky silniční", "material", "m", 640, 310, 420],
            ],
          },
          {
            title: "Odvodnění",
            items: [
              ["Odvodňovací žlaby s mřížemi", "material", "ks", 24, 3200, 4400],
              ["Retenční nádrž 40 m³", "subcontract", "kpl", 1, 310000, 395000],
              ["Přípojka dešťové kanalizace", "subcontract", "m", 86, 2100, 2800],
            ],
          },
        ],
      },
    ],
  },
  zatepleni: {
    vatBp: 1200,
    sections: [
      {
        title: "Lešení",
        kind: "subcontract",
        items: [
          ["Montáž a demontáž fasádního lešení", "subcontract", "m²", 1450, 95, 135],
          ["Pronájem lešení (8 týdnů)", "subcontract", "m²", 1450, 120, 168],
        ],
      },
      {
        title: "Zateplení fasády",
        items: [
          ["Polystyren EPS 70F tl. 160 mm", "material", "m²", 1280, 235, 310],
          ["Lepicí a stěrkovací hmota", "material", "m²", 1280, 82, 110],
          ["Sklotextilní síťovina a rohové lišty", "material", "m²", 1280, 38, 55],
          ["Montáž kontaktního zateplení", "labour", "m²", 1280, 290, 420],
          ["Silikonová omítka zrnitost 1,5 mm", "material", "m²", 1280, 150, 210],
        ],
      },
      {
        title: "Klempířské a ostatní práce",
        items: [
          ["Parapety a oplechování", "subcontract", "m", 186, 420, 590],
          ["Zateplení soklu XPS", "labour", "m²", 140, 360, 490],
          ["Demontáž a zpětná montáž drobností", "labour", "hod", 64, 340, 520],
        ],
      },
    ],
  },
  pekarna: {
    sections: [
      {
        title: "Bourací práce",
        items: [
          ["Bourání příček a podlah", "labour", "m²", 140, 220, 320],
          ["Odvoz suti a poplatky", "other", "t", 38, 780, 990],
        ],
      },
      {
        title: "Podlaha a stěny provozu",
        items: [
          ["Epoxidová podlaha s certifikací pro potraviny", "subcontract", "m²", 210, 980, 1340],
          ["Keramický obklad stěn do výšky 2,2 m", "labour", "m²", 180, 520, 760],
          ["Obkladový materiál", "material", "m²", 180, 410, 560],
        ],
      },
      {
        title: "Vzduchotechnika a elektro",
        items: [
          ["Odsávání nad pecemi", "subcontract", "kpl", 1, 168000, 215000],
          ["Rozvaděč a silové rozvody", "material", "kpl", 1, 94000, 126000],
          ["Montáž elektroinstalace", "labour", "hod", 220, 420, 620],
        ],
      },
      {
        title: "Malby a dokončení",
        items: [
          ["Malba omyvatelná", "labour", "m²", 460, 48, 82],
          ["Úklid po stavbě", "other", "kpl", 1, 9500, 14500],
        ],
      },
    ],
  },
  strecha: {
    vatBp: 1200,
    sections: [
      {
        title: "Demontáž staré krytiny",
        items: [
          ["Demontáž eternitové krytiny", "labour", "m²", 168, 210, 320],
          ["Likvidace azbestové krytiny", "subcontract", "t", 4, 9800, 13200],
        ],
      },
      {
        title: "Nová střecha",
        items: [
          ["Střešní fólie a kontralatě", "material", "m²", 168, 92, 128],
          ["Betonová taška, dodávka", "material", "m²", 168, 360, 470],
          ["Pokládka krytiny", "labour", "m²", 168, 240, 360],
          ["Okapy a svody", "subcontract", "m", 54, 520, 740],
        ],
      },
      {
        title: "Klempířské prvky",
        items: [
          ["Oplechování komína a štítů", "subcontract", "kpl", 1, 18500, 26500],
          ["Střešní okno Velux", "material", "ks", 2, 14200, 18900],
        ],
      },
    ],
  },
  novostavba: {
    vatBp: 1200,
    sections: [
      {
        title: "Základy",
        items: [
          ["Výkop stavební jámy", "machines", "m³", 240, 160, 230],
          ["Základové pasy a deska", "material", "m³", 48, 3200, 3900],
          ["Hydroizolace a drenáž", "subcontract", "kpl", 1, 54000, 72000],
        ],
      },
      {
        title: "Hrubá stavba",
        items: [
          ["Zdivo Porotherm 38 Profi", "material", "m²", 410, 780, 960],
          ["Zdění", "labour", "m²", 410, 320, 460],
          ["Stropní konstrukce Heluz", "subcontract", "m²", 130, 1850, 2300],
          ["Věnce a překlady", "material", "kpl", 1, 86000, 112000],
        ],
      },
      {
        title: "Krov a střecha",
        items: [
          ["Dřevěný krov včetně montáže", "subcontract", "m²", 150, 1250, 1620],
          ["Střešní krytina pálená", "material", "m²", 175, 560, 720],
        ],
      },
      {
        title: "Okna a dveře",
        items: [
          ["Plastová okna trojsklo", "material", "ks", 14, 12800, 16400],
          ["Vchodové dveře", "material", "ks", 1, 32000, 41500],
        ],
      },
    ],
  },
  ordinace: {
    sections: [
      {
        title: "Bourání a příprava",
        items: [
          ["Bourání příček", "labour", "m²", 36, 230, 340],
          ["Vyrovnání podlah, samonivelační stěrka", "labour", "m²", 92, 210, 310],
        ],
      },
      {
        title: "Sádrokartonové konstrukce",
        items: [
          ["SDK příčky s izolací", "material", "m²", 86, 340, 440],
          ["Montáž SDK příček", "labour", "m²", 86, 230, 340],
          ["Podhledy kazetové", "subcontract", "m²", 92, 420, 590],
        ],
      },
      {
        title: "Povrchy",
        items: [
          ["Vinylová podlaha pro zdravotnictví", "material", "m²", 92, 760, 980],
          ["Pokládka vinylu", "labour", "m²", 92, 190, 290],
          ["Malba omyvatelná", "labour", "m²", 280, 52, 88],
        ],
      },
      {
        title: "Instalace",
        items: [
          ["Umyvadla a baterie", "material", "ks", 4, 6200, 8400],
          ["Elektroinstalace, 18 zásuvkových okruhů", "subcontract", "kpl", 1, 92000, 124000],
        ],
      },
    ],
  },
  penzion: {
    sections: [
      {
        title: "Pokoje",
        items: [
          ["Nové podlahy, plovoucí vinyl", "material", "m²", 210, 540, 720],
          ["Pokládka podlah", "labour", "m²", 210, 170, 260],
          ["Malba stěn a stropů", "labour", "m²", 780, 48, 85],
          ["Vestavěné skříně", "subcontract", "ks", 9, 11500, 15800],
        ],
      },
      {
        title: "Koupelny",
        items: [
          ["Obklady a dlažby", "material", "m²", 128, 590, 780],
          ["Pokládka obkladů", "labour", "m²", 128, 480, 690],
          ["Sanitární keramika a armatury", "material", "kpl", 9, 8800, 12500],
        ],
      },
      {
        title: "Recepce a společné prostory",
        items: [
          ["Recepční pult na zakázku", "subcontract", "ks", 1, 46000, 62000],
          ["Podhled s osvětlením", "subcontract", "m²", 60, 780, 1050],
        ],
      },
    ],
  },
  hriste: {
    vatBp: 2100,
    sections: [
      {
        title: "Zemní práce",
        items: [
          ["Odtěžení a vyrovnání plochy", "machines", "m³", 480, 120, 175],
          ["Zhutněný štěrkový podklad", "material", "m³", 310, 520, 690],
        ],
      },
      {
        title: "Povrch hřiště",
        items: [
          ["Polyuretanový povrch sportovní", "subcontract", "m²", 650, 840, 1090],
          ["Čáry a značení", "labour", "kpl", 1, 18000, 26000],
        ],
      },
      {
        title: "Vybavení",
        items: [
          ["Oplocení s ochrannými sítěmi", "material", "m", 118, 1450, 1900],
          ["Basketbalové koše a branky", "material", "kpl", 1, 64000, 86000],
          ["Lavičky a odpadkové koše", "material", "ks", 8, 5400, 7200],
        ],
      },
    ],
  },
  fasada: {
    sections: [
      {
        title: "Oprava fasády",
        items: [
          ["Oklepání a sanace omítek", "labour", "m²", 210, 190, 290],
          ["Penetrace a štuk", "material", "m²", 210, 85, 125],
          ["Fasádní nátěr", "labour", "m²", 210, 98, 150],
          ["Pronájem lešení", "subcontract", "kpl", 1, 21000, 28500],
        ],
      },
    ],
  },
  pristavba: {
    sections: [
      {
        title: "Základy a hrubá stavba",
        items: [
          ["Základová deska 12 × 8 m", "material", "m²", 96, 2400, 3100],
          ["Obvodové zdivo Ytong", "material", "m²", 142, 880, 1140],
          ["Zdění a montáž", "labour", "m²", 142, 340, 480],
          ["Stropní panely", "subcontract", "m²", 96, 1950, 2480],
        ],
      },
      {
        title: "Střecha a fasáda",
        items: [
          ["Ploché střechy, hydroizolace", "subcontract", "m²", 108, 1180, 1520],
          ["Kontaktní zateplení fasády", "subcontract", "m²", 150, 780, 1040],
          ["Hliníková okna", "material", "ks", 11, 21500, 27900],
        ],
      },
      {
        title: "Vnitřní práce",
        items: [
          ["Elektroinstalace včetně datových rozvodů", "subcontract", "kpl", 1, 244000, 318000],
          ["Podhledy a SDK příčky", "subcontract", "m²", 240, 520, 710],
          ["Podlahy, malby a dokončení", "labour", "m²", 220, 640, 880],
        ],
      },
    ],
  },
  zatepleniSbd: {
    vatBp: 1200,
    sections: [
      {
        title: "Zateplení obvodového pláště",
        items: [
          ["Kontaktní zateplení EPS 200 mm", "subcontract", "m²", 2100, 620, 810],
          ["Minerální vata požární pásy", "material", "m²", 210, 450, 590],
          ["Omítka silikonová", "subcontract", "m²", 2100, 210, 285],
        ],
      },
      {
        title: "Střecha a klempířina",
        items: [
          ["Zateplení stropu pod půdou", "labour", "m²", 780, 240, 340],
          ["Klempířské prvky", "subcontract", "kpl", 1, 148000, 192000],
        ],
      },
      {
        title: "Lešení a zařízení staveniště",
        items: [
          ["Lešení kompletní", "subcontract", "kpl", 1, 210000, 268000],
          ["Zařízení staveniště", "other", "měs", 4, 18500, 26000],
        ],
      },
    ],
  },
  vestavba: {
    vatBp: 1200,
    sections: [
      {
        title: "Půdní vestavba",
        items: [
          ["Zaměření a projektová dokumentace", "subcontract", "kpl", 1, 58000, 82000],
          ["Zateplení krovu a SDK", "labour", "m²", 96, 920, 1290],
          ["Střešní okna", "material", "ks", 6, 15800, 21500],
        ],
      },
    ],
  },
  koupelna: {
    vatBp: 1200,
    sections: [
      {
        title: "Koupelna",
        items: [
          ["Demolice a odvoz", "labour", "kpl", 1, 6800, 9800],
          ["Obklady a dlažba včetně hydroizolace", "labour", "m²", 22, 780, 1120],
          ["Sanita a vana", "material", "kpl", 1, 26500, 34900],
        ],
      },
    ],
  },
  domek: {
    sections: [
      {
        title: "Zahradní domek",
        items: [
          ["Dřevostavba 3 × 4 m", "subcontract", "kpl", 1, 68000, 94000],
          ["Základové patky a pergola", "labour", "kpl", 1, 32000, 46000],
        ],
      },
    ],
  },
};
