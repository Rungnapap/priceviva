import { Card, Flash, one, Pill, when } from "@/components/admin-ui";
import { getSampleCatalog } from "@/lib/sample/loader";
import { DUMMYJSON_PRODUCTS_URL } from "@/lib/sample/dummyjson";

export default async function SampleAdmin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = await getSampleCatalog();
  const s = c.status;
  const byCode = (list: { code: string }[]) => Object.entries(list.reduce<Record<string, number>>((m, i) => ((m[i.code] = (m[i.code] ?? 0) + 1), m), {}));
  return (
    <div className="space-y-6">
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <Card
        title="Test data — DummyJSON sample products"
        action={
          <form method="post" action="/api/admin/sample/refresh">
            <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">Refresh sample data now</button>
          </form>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Status</dt><dd><Pill tone={s.ok ? (s.source === "api" ? "ok" : "warn") : "bad"}>{s.ok ? (s.source === "api" ? "Loaded from API" : "Using saved copy") : "Unavailable"}</Pill></dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Products</dt><dd className="text-xl font-semibold">{s.productCount}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Fetched</dt><dd>{when(s.fetchedAt)}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">Auto-refresh</dt><dd>every {process.env.SAMPLE_REFRESH_HOURS ?? "6"} h</dd></div>
        </dl>
        {s.error && <p className="mt-3 text-sm text-warning-ink">{s.error}</p>}
        <p className="mt-3 text-xs text-muted">
          Source: <code>{DUMMYJSON_PRODUCTS_URL}</code>. Placeholder data for testing (DummyJSON code is MIT-licensed; its images carry no usage rights) — do not launch publicly in this mode.
        </p>
        {s.issues.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">{s.issues.length} product notes: {byCode(s.issues).map(([k, n]) => `${k} ${n}`).join(" · ")}</summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-muted">
              {s.issues.map((i, n) => <li key={n}><span className="font-mono">{i.ref}</span> · {i.code} · {i.message}</li>)}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Sample retailer offers — local CSV">
        {!s.csvFound ? (
          <p className="text-sm text-warning-ink">No CSV found. Expected <code>data/sample-offers.csv</code> (or set SAMPLE_OFFERS_CSV).</p>
        ) : s.offers ? (
          <>
            <p className="text-sm">
              {s.offers.rows} rows read · <strong>{s.offers.imported}</strong> demonstration offers imported · {s.offers.issues.length} rejected · {s.offers.retailers.length} sample retailers
              ({s.offers.retailers.map((r) => `${r.name} (${r.country})`).join(", ")}).
            </p>
            {s.offers.issues.length > 0 && (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted"><tr><th className="py-2">CSV row</th><th>Code</th><th>Message</th></tr></thead>
                <tbody>
                  {s.offers.issues.map((i, n) => (
                    <tr key={n} className="border-t border-line"><td className="py-2">{i.row + 1}</td><td className="font-mono text-xs">{i.code}</td><td>{i.message}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted">
              Edit the CSV and press “Refresh sample data now”. Columns are documented in <code>docs/SAMPLE_MODE.md</code>. Sample retailers never get store links;
              blank delivery cells mean “unknown” (never zero), and <code>x</code> means “does not deliver”.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Sample products are not loaded, so offers were not imported.</p>
        )}
      </Card>
    </div>
  );
}
