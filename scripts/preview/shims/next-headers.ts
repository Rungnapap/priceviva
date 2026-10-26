// Sandbox shim: read cookies from the browser.
export async function cookies() {
  const map = new Map(document.cookie.split(";").map((c) => c.trim().split("=") as [string, string]).filter(([k]) => k));
  return { get: (n: string) => (map.has(n) ? { value: decodeURIComponent(map.get(n)!) } : undefined), set() {}, delete() {} };
}
