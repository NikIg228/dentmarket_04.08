"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBuyerSession } from "./use-buyer-session";
import { supplierAppUrl } from "./public-links";

const SupplierCatalogContext = createContext(false);
export const useSupplierCatalogSession = () => useContext(SupplierCatalogContext);

// This only offers navigation. The supplier token is never installed as a buyer session.
export function SupplierCatalogSession({ children }: { children: ReactNode }) {
  const { session, ready } = useBuyerSession();
  const pathname = usePathname();
  const [supplier, setSupplier] = useState(false);
  useEffect(() => {
    let active = true;
    setSupplier(false);
    if (!ready || session) return;
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
    void fetch(`${api}/auth/current?workspace=SUPPLIER`, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15_000) })
      .then(async response => response.ok ? (await import("@marketplace/schemas/workspace-session")).currentSessionSchema.safeParse(await response.json()) : null)
      .then(result => {
        if (!active || !result?.success) return;
        const allowed = result.data.workspaces.some(item => item.organizationId === result.data.activeOrganizationId && item.capabilities.includes("SUPPLIER"));
        setSupplier(allowed);
        // /catalog is the explicit public destination; product/direct links remain intact.
        if (allowed && pathname === "/" && !window.location.search && !window.location.hash) window.location.replace(supplierAppUrl);
      }).catch(() => { /* Public browsing remains available while auth is unreachable. */ });
    return () => { active = false; };
  }, [ready, session, pathname]);
  return <SupplierCatalogContext.Provider value={supplier}>{children}</SupplierCatalogContext.Provider>;
}
