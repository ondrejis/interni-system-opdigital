"use client";

import type { EntityDescriptor, RecordRow } from "@rebar/core/shared";
import { useMutation } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "../components/button";
import { errorToast, successToast } from "../components/toast";
import { useEntityApi } from "./context";
import { useInvalidateEntity } from "./hooks";

/**
 * Zámek viditelnosti v hlavičce záznamu (SPOL-12, VID-03). Vlastník (`private.read`) ho přepíná: soukromý záznam
 * a jeho podřízené záznamy (úkoly, poznámky, platby, hodiny) nikdy neuvidí ostatní. U záznamu, který zámek jen dědí
 * (hodiny, fáze), nebo zámek zdědil od nadřazeného záznamu, ukáže stav bez možnosti přepnutí. Ostatním se nezobrazí nic.
 * Moduly s vlastní hlavičkou (`recordHeader`) ho přidají samy.
 */
export function VisibilityLock({
  entity,
  id,
  row,
}: {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
}) {
  const api = useEntityApi();
  const invalidate = useInvalidateEntity(entity.key);
  const isPrivate = row.isPrivate === true;
  const inherited = row.visibilitySource === "inherited";
  const toggle = useMutation({
    mutationFn: () => api.setVisibility(entity.key, [id], !isPrivate),
    onSuccess: (r) => {
      void invalidate();
      successToast(
        !isPrivate
          ? `Záznam je soukromý${r.changed > 1 ? ` (včetně ${r.changed - 1} podřízených)` : ""}.`
          : "Záznam je sdílený.",
      );
    },
    onError: (e: Error) => errorToast(e.message),
  });
  if (!entity.visibility?.hasLock) return null;
  if (!entity.visibility.lockable)
    return isPrivate ? (
      <span className="inline-flex items-center gap-1 text-sm text-muted" data-testid="record-lock">
        <Lock className="size-3.5" /> Soukromé{inherited ? " (zděděno)" : ""}
      </span>
    ) : null;
  return (
    <Button
      variant={isPrivate ? "primary" : "secondary"}
      loading={toggle.isPending}
      onClick={() => toggle.mutate()}
      aria-pressed={isPrivate}
      title={
        isPrivate
          ? inherited
            ? "Soukromé (zděděno od nadřazeného záznamu). Kliknutím ho zveřejníte."
            : "Soukromé: vidíte jen vy. Kliknutím záznam zveřejníte."
          : "Sdílené. Kliknutím záznam zamknete, aby ho nikdo jiný neviděl."
      }
      data-testid="record-lock"
    >
      {isPrivate ? <Lock /> : <LockOpen />}
      {isPrivate ? "Soukromé" : "Sdílené"}
    </Button>
  );
}
