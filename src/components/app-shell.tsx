import type { ReactNode } from "react";
import { CatalogProvider, type CatalogClientInfo } from "./catalog-context";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { Toaster } from "./toast";
import { PageExperience } from "./page-experience";
import { MobileTabBar } from "./mobile-tab-bar";
import { AlertWatcher } from "./alerts";
import { AccountSync } from "./account-sync";
import { I18nProvider } from "./i18n-provider";
import type { Locale } from "@/i18n/config";

export function AppShell({ children, catalog, locale }: { children: ReactNode; catalog: CatalogClientInfo; locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
    <CatalogProvider value={catalog}>
      <PageExperience />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
      <AlertWatcher />
      <AccountSync />
      <Toaster />
    </CatalogProvider>
    </I18nProvider>
  );
}

/** Runs before paint so the saved/system theme applies without a flash. */
export const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem("priceatlas:v1")||"{}");var t=s.theme||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;
