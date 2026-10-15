/*
  U zakázky (HOD-03): odpracováno vs. odhad úkolů a efektivní hodinová sazba každého z dvojice
  (jeho podíl na příjmech ÷ jeho hodiny). Čistá funkce; data dodává služba (hodiny z DB, odhad z úkolů, podíly z financí).
*/

/** Odpracované minuty jednoho člověka na zakázce. */
export type UserMinutes = { userId: string; minutes: number };

/** Vstup výpočtu. */
export type JobEffortInput = {
  hours: readonly UserMinutes[];
  /** Součet odhadů úkolů v minutách; `null` nebo 0 = odhad není. */
  estimateMin: number | null;
  /** Podíl každého člověka na příjmech zakázky v haléřích (`finance.allocatedByUser`); `null` = finance nejsou k dispozici. */
  incomeByUser: Readonly<Record<string, number>> | null;
};

/** Člověk v přehledu zakázky. */
export type UserEffort = {
  userId: string;
  minutes: number;
  /** Podíl na odpracovaných hodinách zakázky v procentech (0 až 100); `null`, když nikdo nic nezapsal. */
  sharePct: number | null;
  /** Podíl na příjmech v haléřích; `null`, když finance nejsou k dispozici. */
  incomeMinor: number | null;
  /** Efektivní sazba v haléřích za hodinu; `null` bez příjmů nebo bez hodin. */
  rateMinor: number | null;
};

/** Výsledek výpočtu. */
export type JobEffort = {
  workedMinutes: number;
  estimateMin: number | null;
  /** Kolik z odhadu zbývá (nikdy záporné); `null` bez odhadu. */
  remainingMinutes: number | null;
  /** O kolik je odhad překročen (0, když ne); `null` bez odhadu. */
  overrunMinutes: number | null;
  /** Odpracováno jako procento odhadu (může být nad 100); `null` bez odhadu. */
  progressPct: number | null;
  users: UserEffort[];
  /** Příjmy zakázky celkem (součet podílů) v haléřích; `null`, když finance nejsou k dispozici. */
  totalIncomeMinor: number | null;
  /** Efektivní sazba zakázky jako celku (příjmy ÷ všechny hodiny); `null` bez příjmů nebo bez hodin. */
  effectiveRateMinor: number | null;
};

/** Efektivní hodinová sazba v haléřích; `null`, když nejsou žádné odpracované minuty. */
export function hourlyRate(incomeMinor: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  return Math.round((incomeMinor * 60) / minutes);
}

/**
 * Spočítá, kolik zakázka stála času a jaká z ní vyšla hodinovka. Lidé z hodin a z příjmů se spojí (kdo má jen příjem,
 * má sazbu `null`, kdo má jen hodiny, příjem 0). Pořadí: nejvíc hodin první, při shodě podle id.
 */
export function computeJobEffort(input: JobEffortInput): JobEffort {
  const minutesBy = new Map<string, number>();
  for (const h of input.hours)
    minutesBy.set(h.userId, (minutesBy.get(h.userId) ?? 0) + Math.max(0, h.minutes));
  const income = input.incomeByUser;
  if (income) for (const id of Object.keys(income)) if (!minutesBy.has(id)) minutesBy.set(id, 0);

  const workedMinutes = [...minutesBy.values()].reduce((a, b) => a + b, 0);
  const estimate = input.estimateMin && input.estimateMin > 0 ? input.estimateMin : null;
  const totalIncomeMinor = income ? Object.values(income).reduce((a, b) => a + b, 0) : null;

  const users = [...minutesBy.entries()]
    .map(([userId, minutes]): UserEffort => {
      const incomeMinor = income ? (income[userId] ?? 0) : null;
      return {
        userId,
        minutes,
        sharePct: workedMinutes > 0 ? Math.round((minutes / workedMinutes) * 1000) / 10 : null,
        incomeMinor,
        rateMinor: incomeMinor === null ? null : hourlyRate(incomeMinor, minutes),
      };
    })
    .sort((a, b) => b.minutes - a.minutes || a.userId.localeCompare(b.userId));

  return {
    workedMinutes,
    estimateMin: estimate,
    remainingMinutes: estimate === null ? null : Math.max(0, estimate - workedMinutes),
    overrunMinutes: estimate === null ? null : Math.max(0, workedMinutes - estimate),
    progressPct: estimate === null ? null : Math.round((workedMinutes / estimate) * 100),
    users,
    totalIncomeMinor,
    effectiveRateMinor: totalIncomeMinor === null ? null : hourlyRate(totalIncomeMinor, workedMinutes),
  };
}
