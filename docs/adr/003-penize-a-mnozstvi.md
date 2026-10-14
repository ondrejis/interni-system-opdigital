# ADR 003: Peníze a množství

- Stav: přijato (2026-10-08; audit Q11 — výchozí volba)
- Kontext: `docs/AUDIT.md` D4, P7

## Rozhodnutí

- **Peněžní částky** jsou `bigint` v haléřích plus kód měny (`char(3)`, výchozí `CZK`). Sloupce se jmenují `*_minor`. Sazby DPH jsou v `vat_rate` v setinách procenta (`rate_bp`, 21 % = 2100).
- **Množství** (sklad, stroje) jsou `numeric(14,3)`.
- **Jednotková cena skladové položky** je `numeric(14,4)`. Je to **zdokumentovaná výjimka** z „celé číslo v haléřích“: vážený průměr musí mít přesnost pod haléř, jinak se chyba při každém příjmu kumuluje. Součty řádků a dokladů se po výpočtu zaokrouhlí na haléře a ukládají se jako `bigint`.
- V kódu se `numeric` nikdy nečte jako JS `number`. Používá se řetězec + decimal knihovna (výběr ve fázi 4 při portu skladu) nebo celá čísla v haléřích.
- Zaokrouhlování: půl nahoru (od nuly), jedno místo v kódu (`@rebar/core`).
