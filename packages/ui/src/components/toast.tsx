"use client";

import { Toaster as Sonner, toast } from "sonner";

/** Oznámení vpravo dole. U vratných akcí se používá `undoToast`, potvrzovací dialog jen u nevratných. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      // na telefonu nad spodní navigací (kancelář i terminál), ať oznámení nezakrývá ovládání
      mobileOffset={{ bottom: 88, left: 16, right: 16 }}
      closeButton={false}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-line !bg-bg !text-fg !shadow-float !text-base",
        },
      }}
    />
  );
}

export { toast };

export function successToast(message: string) {
  toast.success(message);
}

export function errorToast(message: string) {
  toast.error(message, { duration: 6000 });
}

/** Toast s tlačítkem „Zpět“ (vratná akce; zpětná změna se provede až po kliknutí). */
export function undoToast(message: string, onUndo: () => void | Promise<void>) {
  toast(message, { duration: 6000, action: { label: "Zpět", onClick: () => void onUndo() } });
}
