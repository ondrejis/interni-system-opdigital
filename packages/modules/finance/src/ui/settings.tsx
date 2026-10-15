"use client";

import type { SplitRuleInput } from "@rebar/core/contracts";
import {
  Button,
  FormSection,
  Icon,
  SegmentedControl,
  SettingsPage,
  Skeleton,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { FinanceSettings as Settings } from "../contract";
import { useToastMutation } from "./common";
import { SplitEditor } from "./split-editor";
import { blocking, ruleIssues } from "./split-logic";

/**
 * Nastavení → Finance (NAS-09): z čeho se počítá saldo vyrovnání (zaplacené / vystavené) a výchozí rozdělení nových
 * zakázek. Bez zadaného výchozího rozdělení se použije 50 / 50 mezi vlastníkem a partnerem.
 */
export function FinanceSettings() {
  const q = useCommandQuery<Settings>("finance.settings.get", {});
  const [basis, setBasis] = useState<"paid" | "issued">("paid");
  const [rules, setRules] = useState<SplitRuleInput[]>([]);
  useEffect(() => {
    if (q.data) {
      setBasis(q.data.balanceBasis);
      setRules(q.data.defaultSplit);
    }
  }, [q.data]);

  const saveBasis = useToastMutation("finance.settings.set", { success: "Základ salda uložen." });
  const saveSplit = useToastMutation("finance.settings.set", {
    success: "Výchozí rozdělení uloženo.",
  });
  const d = q.data;
  const basisDirty = !!d && basis !== d.balanceBasis;
  const splitDirty = !!d && JSON.stringify(rules) !== JSON.stringify(d.defaultSplit);
  const blocked = blocking(ruleIssues(rules));

  return (
    <SettingsPage
      title="Finance"
      description="Základ salda a výchozí rozdělení plateb mezi partnery."
      icon={<Icon name="wallet" />}
    >
      {q.isLoading || !d ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <FormSection
            title="Základ salda vyrovnání"
            description="Z jakých plateb se počítá, kdo komu dluží. Zaplacené je opatrnější: dluh vzniká, až když peníze přijdou."
            icon={<Icon name="scale" />}
            data-testid="settings-basis"
            footer={
              <Button
                variant="primary"
                disabled={!basisDirty}
                loading={saveBasis.pending}
                onClick={() => saveBasis.run({ balanceBasis: basis })}
                data-testid="settings-basis-save"
              >
                Uložit
              </Button>
            }
          >
            <SegmentedControl
              label="Základ salda"
              value={basis}
              onChange={setBasis}
              options={[
                { value: "paid", label: "Zaplacené platby" },
                { value: "issued", label: "Vystavené (i zaplacené)" },
              ]}
            />
          </FormSection>

          <FormSection
            title="Výchozí rozdělení nových zakázek"
            description="Nové zakázky dostanou tato pravidla; u každé zakázky jdou změnit. Změna se neprojeví u existujících zakázek."
            icon={<Icon name="wallet" />}
            data-testid="settings-split"
            footer={
              <>
                {d.defaultSplitConfigured && (
                  <Button
                    variant="ghost"
                    loading={saveSplit.pending}
                    onClick={() => saveSplit.run({ defaultSplit: null })}
                  >
                    Vrátit na 50 / 50
                  </Button>
                )}
                <Button
                  variant="primary"
                  disabled={!splitDirty || blocked}
                  loading={saveSplit.pending}
                  onClick={() => saveSplit.run({ defaultSplit: rules })}
                  data-testid="settings-split-save"
                >
                  Uložit rozdělení
                </Button>
              </>
            }
          >
            {!d.defaultSplitConfigured && (
              <p className="mb-3 text-sm text-muted">
                Zatím není nastaveno, platí 50 / 50 mezi vlastníkem a partnerem.
              </p>
            )}
            <SplitEditor value={rules} onChange={(v) => setRules(v ?? [])} />
          </FormSection>
        </>
      )}
    </SettingsPage>
  );
}
