"use client";

import { createContext, useContext, type ReactNode } from "react";
import { fxSnapshot } from "@/data/fx";
import type { FxTable } from "@/lib/money";
import type { CatalogMode } from "@/lib/types";

export interface CatalogClientInfo {
  mode: CatalogMode;
  fx: FxTable;
  fxIsReference: boolean;
  storesAvailable: boolean;
  notice?: string | null;
}

const Ctx = createContext<CatalogClientInfo>({ mode: "demo", fx: fxSnapshot, fxIsReference: false, storesAvailable: true });

export function CatalogProvider({ value, children }: { value: CatalogClientInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx);
