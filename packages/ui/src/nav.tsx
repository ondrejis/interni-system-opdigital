"use client";

import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type NavApi = {
  /** Odkaz aplikace (v Next.js `next/link`, jinde obyčejné `<a>`). */
  Link: ComponentType<LinkProps>;
  push: (href: string) => void;
  replace: (href: string) => void;
  /** Znovu načte data stránky ze serveru (po změně, která se promítá do navigace). */
  refresh: () => void;
};

const DefaultLink: ComponentType<LinkProps> = (props) => <a {...props} />;
const Ctx = createContext<NavApi>({
  Link: DefaultLink,
  push: (h) => (window.location.href = h),
  replace: (h) => window.location.replace(h),
  refresh: () => window.location.reload(),
});

/** Design system nezná router; aplikace mu ho předá. */
export function NavProvider({ value, children }: { value: NavApi; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNav = () => useContext(Ctx);
