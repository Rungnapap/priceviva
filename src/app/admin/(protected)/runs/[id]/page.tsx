import { notFound } from "next/navigation";
import { Card, Flash, one, Pill, statusTone, when } from "@/components/admin-ui";
import { rpc } from "@/lib/server/supabase-rpc";

interface RunDetail {
  run: { id: string; feed_name: string; status: string; trigger: string; started_at: string; finished_at: string | null; rows_total: number; rows_imported: number; rows_rejected: number;
         variants_created: number; offers_created: number; offers_updated: number; offers_deactivated: number; message: string | null } | null;
  errors: { id: number; row_number: number | null; external_id: string | null; severity: string; code: string; message: string }[];
  error_summary: Record<string, number>;
}

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await rpc<RunDetail>("pa_admin_run", { run_id: id }, { role: "service" });
  if (!d.run) notFound();
  const r = d.run;
  const stats: [string, number][] = [["Rows in file", r.rows_total], ["Imported", r.rows_imported], ["Rejected", r.rows_rejected], ["New products", r.variants_created], ["New offers", r.offers_created], ["Updated offers", r.offers_updated], ["Deactivated offers", r.offers_deactivated]];
  return (
    <div className="space-y-6">
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <Card title={`${r.feed_name} — import run`} action={<Pill tone={statusTone(r.status)}>{r.status}</Pill>}>
        <p className="text-sm text-muted">{r.trigger} · started {when(r.started_at)} · finished {when(r.finished_at)}</p>
        {r.message && <p className="mt-2 text-sm">{r.message}</p>}
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          {stats.map(([k, v]) => <div key={k} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>)}
        </dl>
      </Card>
      <Card title={`Problems (${d.errors.length}${d.errors.length >= 500 ? "+" : ""})`}>
        {Object.keys(d.error_summary).length > 0 && (
          <p className="mb-3 flex flex-wrap gap-2 text-sm">{Object.entries(d.error_summary).map(([k, n]) => <Pill key={k} tone="muted">{k}: {n}</Pill>)}</p>
        )}
        {d.errors.length === 0 ? <p className="text-sm text-muted">No problems recorded.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Row</th><th>Product id</th><th>Level</th><th>Code</th><th>Message</th></tr></thead>
              <tbody>
                {d.errors.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="py-2">{e.row_number ?? "—"}</td><td className="font-mono text-xs">{e.external_id ?? "—"}</td>
                    <td><Pill tone={e.severity === "error" ? "bad" : "warn"}>{e.severity}</Pill></td><td className="font-mono text-xs">{e.code}</td><td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
