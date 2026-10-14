import { Icon } from "../lib/icons";
import { EmptyState } from "./badges";

/**
 * Zástupná stránka pro část systému, která se teprve staví (kostra S0). Modul ji vrací z `ui.pages`, dokud nemá
 * skutečný obsah; plný obsah ji nahradí.
 */
export function Placeholder({
  title,
  description = "Tato část OPSYS se právě staví.",
  icon = "list",
}: {
  title: string;
  description?: string;
  /** Název ikony z `Icon`. */
  icon?: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="placeholder">
      <EmptyState
        icon={<Icon name={icon} className="size-5" />}
        title={title}
        description={description}
      />
    </div>
  );
}
