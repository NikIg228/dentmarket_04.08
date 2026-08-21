"use client";

import { MarketplaceProvider } from "@marketplace/ui";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <MarketplaceProvider>{children}</MarketplaceProvider>;
}
