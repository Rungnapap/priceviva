/** 303 back to an admin page with a short status message (shown once on the page). */
export function back(req: Request, path: string, msg: string, ok = true): Response {
  const u = new URL(path, req.url);
  u.searchParams.set(ok ? "ok" : "err", msg.slice(0, 300));
  return Response.redirect(u, 303);
}
