"use client";

import { Briefcase, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThemeSwitch,
  Tooltip,
  errorToast,
  successToast,
  undoToast,
  LABEL_COLORS,
} from "@rebar/ui";
import { CrmDemo } from "./crm-demo";

export function Showcase() {
  const [date, setDate] = useState<string | null>("2026-10-08");
  const [company, setCompany] = useState<string | string[] | null>(null);
  const [roles, setRoles] = useState<string | string[] | null>(["client"]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Design system</h1>
        <ThemeSwitch className="w-32" />
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tlačítka</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">
            <Plus /> Nová zakázka
          </Button>
          <Button>Sekundární</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">
            <Trash2 /> Smazat
          </Button>
          <Button variant="primary" loading>
            Ukládám
          </Button>
          <Button size="sm">Malé</Button>
          <Tooltip label="Hledání" shortcut="⌘K">
            <IconButton label="Hledat">
              <Briefcase />
            </IconButton>
          </Tooltip>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Štítky a stavy</h2>
        <div className="flex flex-wrap gap-2">
          {LABEL_COLORS.map((c) => (
            <Chip key={c} color={c} dot>
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="Jana Nováková" />
          <Avatar name="Petr Svoboda" size={28} />
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Název">
            <Input placeholder="Rekonstrukce koupelny" />
          </Field>
          <Field label="Chybné pole" error="Vyplňte název.">
            <Input aria-invalid defaultValue="" />
          </Field>
          <Field label="Firma">
            <Combobox
              value={company}
              onChange={setCompany}
              options={[
                { value: "1", label: "Stavby Novák", hint: "Plzeň" },
                { value: "2", label: "Černý a syn", hint: "Rokycany" },
                { value: "3", label: "Čížek s.r.o." },
              ]}
              placeholder="Vyberte firmu"
              clearable
            />
          </Field>
          <Field label="Role (více hodnot)">
            <Combobox
              multiple
              value={roles}
              onChange={setRoles}
              options={[
                { value: "client", label: "Klient" },
                { value: "supplier", label: "Dodavatel" },
                { value: "subcontractor", label: "Subdodavatel" },
              ]}
            />
          </Field>
        </div>
        <div>
          <Field label="Datum zahájení">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <label className="flex items-center gap-2">
            <Checkbox defaultChecked /> Zobrazit dokončené
          </label>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => successToast("Zakázka uložena.")}>Úspěch</Button>
            <Button onClick={() => errorToast("Nepodařilo se uložit.")}>Chyba</Button>
            <Button onClick={() => undoToast("Zakázka smazána.", () => successToast("Obnoveno."))}>
              Se vrácením
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Upravit</DropdownMenuItem>
            <DropdownMenuItem danger>
              <Trash2 /> Smazat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Otevřít modál</Button>
          </DialogTrigger>
          <DialogContent title="Nová zakázka" description="Vyplňte jen povinná pole.">
            <div className="p-5">
              <Field label="Název">
                <Input autoFocus />
              </Field>
              <Button variant="primary">Uložit</Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Přehled</TabsTrigger>
          <TabsTrigger value="b">Aktivita</TabsTrigger>
          <TabsTrigger value="c">Soubory</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="py-4">
          Obsah záložky Přehled.
        </TabsContent>
      </Tabs>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line">
          <EmptyState
            icon={<Briefcase />}
            title="Zatím žádné zakázky"
            description="Založte první zakázku nebo převeďte vyhranou poptávku."
            action={
              <Button variant="primary">
                <Plus /> Nová zakázka
              </Button>
            }
          />
        </div>
        <div className="space-y-2 rounded-lg border border-line p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>

      <CrmDemo />
    </div>
  );
}
