import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "./client-new";

const repoRoot = path.resolve(import.meta.dirname, "../..");
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "client-new-"));
  fs.cpSync(path.join(repoRoot, "clients", "_template"), path.join(root, "clients", "_template"), {
    recursive: true,
    filter: (s) => !s.includes("node_modules"),
  });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("createClient", () => {
  it("vytvoří klienta ze šablony s jeho slugem, názvem a jménem balíčku", () => {
    const target = createClient({ slug: "stavby-novak", name: "Stavby Novák", root });
    const config = fs.readFileSync(path.join(target, "config.ts"), "utf8");
    expect(config).toContain('slug: "stavby-novak"');
    expect(config).toContain('name: "Stavby Novák"');
    expect(config).not.toContain("novy-klient");
    const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("@client/stavby-novak");
    expect(fs.existsSync(path.join(target, "extensions", "index.ts"))).toBe(true);
  });

  it("bez názvu odvodí viditelný název ze slugu", () => {
    const target = createClient({ slug: "stavby-novak", root });
    expect(fs.readFileSync(path.join(target, "config.ts"), "utf8")).toContain(
      'name: "Stavby Novak"',
    );
  });

  it("odmítne špatný slug a už existujícího klienta", () => {
    expect(() => createClient({ slug: "Špatný", root })).toThrow(/kebab-case/);
    createClient({ slug: "firma", root });
    expect(() => createClient({ slug: "firma", root })).toThrow(/už existuje/);
  });
});
