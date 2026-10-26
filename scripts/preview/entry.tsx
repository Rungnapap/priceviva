// Sandbox-only client router that renders the real src/app pages (demo or live mode).
import { createRoot } from "react-dom/client";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { CatalogClientInfo } from "@/components/catalog-context";
import { getRepository } from "@/lib/catalog/repository";
import { NotFoundError } from "./shims/next-navigation";
import { getLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import Home from "@/app/page";
import Departments from "@/app/departments/page";
import Department from "@/app/departments/[slug]/page";
import SearchPage from "@/app/search/page";
import Product from "@/app/product/[slug]/page";
import Compare from "@/app/compare/page";
import Deals from "@/app/deals/page";
import Saved from "@/app/saved/page";
import Account from "@/app/account/page";
import About from "@/app/about/page";
import Privacy from "@/app/privacy/page";
import Contact from "@/app/contact/page";
import Shop from "@/app/shop/[slug]/page";
import Alerts from "@/app/alerts/page";
import PriceHistory from "@/app/price-history/page";
import Stores from "@/app/stores/page";
import NotFound from "@/app/not-found";
import { GET as productsApi } from "@/app/api/products/route";
import { GET as suggestApi } from "@/app/api/search/suggest/route";
import { GET as geocodeApi } from "@/app/api/geocode/route";
import { GET as localOffersApi } from "@/app/api/local-offers/route";
import { GET as imageProxyApi } from "@/app/api/image-proxy/route";
import { GET as visualIndexApi } from "@/app/api/visual-index/route";
import { GET as barcodeApi } from "@/app/api/barcode/route";
import Login from "@/app/login/page";
import Signup from "@/app/signup/page";
import ForgotPassword from "@/app/forgot-password/page";
import ResetPassword from "@/app/reset-password/page";
import Unsubscribe from "@/app/unsubscribe/page";
import * as auth from "@/lib/server/auth/handlers";

// Account routes (run in the page in this sandbox; see shims/auth-http.ts).
const AUTH_ROUTES: Record<string, (r: Request) => Promise<Response>> = {
  "GET /api/auth/session": auth.sessionGET, "POST /api/auth/login": auth.loginPOST, "POST /api/auth/signup": auth.signupPOST,
  "POST /api/auth/logout": auth.logoutPOST, "POST /api/auth/forgot": auth.forgotPOST, "POST /api/auth/reset": auth.resetPOST,
  "POST /api/auth/resend": auth.resendPOST, "GET /api/account/data": auth.accountDataGET, "POST /api/account/sync": auth.accountSyncPOST,
};

// Route the app's own /api calls to the real route handlers (no server in the sandbox).
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin && url.pathname === "/api/products") return productsApi(new Request(url));
  if (url.origin === location.origin && url.pathname === "/api/search/suggest") return suggestApi(new Request(url));
  if (url.origin === location.origin && url.pathname === "/api/geocode") return geocodeApi(new Request(url));
  if (url.origin === location.origin && url.pathname === "/api/local-offers") return localOffersApi(new Request(url));
  if (url.origin === location.origin && url.pathname === "/api/image-proxy") return imageProxyApi(new Request(url));
  if (url.origin === location.origin && url.pathname === "/api/visual-index") return visualIndexApi();
  if (url.origin === location.origin && url.pathname === "/api/barcode") return barcodeApi(new Request(url));
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const handler = url.origin === location.origin ? AUTH_ROUTES[`${method} ${url.pathname}`] : undefined;
  if (handler) {
    const headers = new Headers(init?.headers);
    headers.set("x-pv-origin", location.origin);
    return handler(new Request(url, { method, headers, body: init?.body ?? null }));
  }
  return realFetch(input, init);
};

type Page = (props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) => ReactNode | Promise<ReactNode>;
const routes: [RegExp, Page][] = [
  [/^\/$/, Home as unknown as Page], [/^\/departments$/, Departments as unknown as Page], [/^\/departments\/(?<slug>[^/]+)$/, Department as unknown as Page],
  [/^\/search$/, SearchPage as unknown as Page], [/^\/product\/(?<slug>[^/]+)$/, Product as unknown as Page], [/^\/compare$/, Compare as Page],
  [/^\/deals$/, Deals as Page], [/^\/saved$/, () => <Saved />], [/^\/account$/, Account as unknown as Page],
  [/^\/login$/, Login as unknown as Page], [/^\/signup$/, Signup as unknown as Page], [/^\/forgot-password$/, ForgotPassword as unknown as Page],
  [/^\/reset-password$/, ResetPassword as unknown as Page], [/^\/unsubscribe$/, Unsubscribe as unknown as Page], [/^\/about$/, About as unknown as Page],
  [/^\/shop\/(?<slug>[^/]+)$/, Shop as unknown as Page], [/^\/alerts$/, Alerts as unknown as Page], [/^\/price-history$/, PriceHistory as unknown as Page],
  [/^\/stores$/, Stores as unknown as Page], [/^\/privacy$/, () => <Privacy />], [/^\/contact$/, Contact as unknown as Page],
];

async function resolve(): Promise<ReactNode> {
  const path = location.pathname.replace(/\/$/, "") || "/";
  // The e-mail link target is a server route in the real app (a redirect); emulate it here.
  if (path === "/auth/callback") {
    const res = await auth.callbackGET(new Request(location.href));
    location.replace(res.headers.get("x-pv-location") ?? "/");
    return null;
  }
  const sp = Object.fromEntries(new URLSearchParams(location.search));
  for (const [re, Page] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try { return await Page({ params: Promise.resolve({ ...(m.groups ?? {}) }), searchParams: Promise.resolve(sp) }); }
    catch (e) { if (e instanceof NotFoundError) return <NotFound />; throw e; }
  }
  return <NotFound />;
}

function App({ catalog, locale }: { catalog: CatalogClientInfo; locale: Locale }) {
  const [el, setEl] = useState<ReactNode>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    const go = () => resolve().then((n) => { setEl(n); setKey((k) => k + 1);
      requestAnimationFrame(() => { if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); else window.scrollTo(0, 0); }); });
    go();
    window.addEventListener("pa:navigate", go);
    window.addEventListener("popstate", go);
    return () => { window.removeEventListener("pa:navigate", go); window.removeEventListener("popstate", go); };
  }, []);
  return <AppShell catalog={catalog} locale={locale}><div key={key}>{el}</div></AppShell>;
}

const meta = await getRepository().meta();
const locale = await getLocale();
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(<App catalog={{ mode: meta.mode, fx: meta.fx, fxIsReference: meta.fxIsReference, storesAvailable: meta.storesAvailable, notice: meta.notice ?? null }} locale={locale} />);
