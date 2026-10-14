"use client";

import { NavProvider, Toaster, TooltipProvider } from "@rebar/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { PushBridge } from "./push-bridge";

type AnchorProps = ComponentProps<"a"> & { href: string };
const AppLink = ({ href, ...rest }: AnchorProps) => <Link href={href} {...rest} />;

/**
 * Společné služby klientské části: cache dat (TanStack Query, ADR 004), router pro design system,
 * nápovědy a oznámení.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <NavProvider
        value={{
          Link: AppLink,
          push: (h) => router.push(h),
          replace: (h) => router.replace(h),
          refresh: () => router.refresh(),
        }}
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
        <PushBridge />
      </NavProvider>
    </QueryClientProvider>
  );
}
