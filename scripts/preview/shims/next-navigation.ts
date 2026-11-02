export class NotFoundError extends Error {}
export function navigate(href: string) {
  const u = new URL(href, location.href);
  if (u.pathname === location.pathname && u.search === location.search && u.hash) { location.hash = u.hash; return; }
  history.pushState(null, "", u.pathname + u.search + u.hash);
  window.dispatchEvent(new Event("pa:navigate"));
}
export function useRouter() { return { push: navigate, replace: navigate, back: () => history.back(), refresh: () => {} }; }
export function usePathname() { return location.pathname; }
export function notFound(): never { throw new NotFoundError("not found"); }

export function permanentRedirect(href: string): never { navigate(href); throw new Error(`Redirect: ${href}`); }
