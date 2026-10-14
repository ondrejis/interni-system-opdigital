import fs from "node:fs";
import path from "node:path";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type CreateClientOptions = {
  slug: string;
  /** Viditelný název systému klienta. */
  name?: string;
  /** Kořen repozitáře (v testech dočasná složka). */
  root: string;
};

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Vytvoří `clients/<slug>` ze šablony `clients/_template`. */
export function createClient({ slug, name, root }: CreateClientOptions): string {
  if (!SLUG.test(slug)) {
    throw new Error(
      `Neplatný slug „${slug}“: použijte malá písmena, číslice a pomlčky (kebab-case).`,
    );
  }
  const template = path.join(root, "clients", "_template");
  const target = path.join(root, "clients", slug);
  if (!fs.existsSync(template)) throw new Error(`Šablona nenalezena: ${template}`);
  if (fs.existsSync(target)) throw new Error(`Klient „${slug}“ už existuje: ${target}`);

  fs.cpSync(template, target, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes("node_modules"),
  });

  const title = name?.trim() || titleFromSlug(slug);
  const short = title.length > 20 ? title.slice(0, 20).trim() : title;

  const pkgPath = path.join(target, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name: string };
  pkg.name = `@client/${slug}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  const configPath = path.join(target, "config.ts");
  const config = fs
    .readFileSync(configPath, "utf8")
    .replace('slug: "novy-klient"', `slug: ${JSON.stringify(slug)}`)
    .replace('name: "Název systému klienta"', `name: ${JSON.stringify(title)}`)
    .replace('shortName: "Systém"', `shortName: ${JSON.stringify(short)}`);
  fs.writeFileSync(configPath, config);

  return target;
}
