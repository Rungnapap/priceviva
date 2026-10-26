import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell, themeScript } from "@/components/app-shell";
import type { CatalogClientInfo } from "@/components/catalog-context";
import { fxSnapshot } from "@/data/fx";
import { getRepository } from "@/lib/catalog/repository";
import { getLocale } from "@/i18n/server";
import { indexingAllowed } from "@/lib/server/seo";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "PriceViva — Discover More. Compare Better.",
    template: "%s · PriceViva",
  },
  applicationName: "PriceViva",
  description:
    "PriceViva is a global shopping discovery and price-comparison platform: explore products from local and international stores, compare offers and delivered totals, and discover local deals.",
  // Kept out of search engines until the owner enables indexing and real retailer data is live.
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111a2e" },
  ],
};

async function catalogInfo(): Promise<CatalogClientInfo> {
  const repo = getRepository();
  try {
    const m = await repo.meta();
    return { mode: m.mode, fx: m.fx, fxIsReference: m.fxIsReference, storesAvailable: m.storesAvailable, notice: m.notice ?? null };
  } catch {
    // Database unreachable: keep the site up; pages show their own "temporarily unavailable" states.
    return { mode: repo.mode, fx: { ...fxSnapshot, label: "Demo reference rates — live rates unavailable" }, fxIsReference: false, storesAvailable: false, notice: "The catalogue is temporarily unavailable." };
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [catalog, locale] = await Promise.all([catalogInfo(), getLocale()]);
  return (
    <html lang={locale} className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <AppShell catalog={catalog} locale={locale}>{children}</AppShell>
      </body>
    </html>
  );
}
