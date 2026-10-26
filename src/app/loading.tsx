/** Shown while a page's data (e.g. the sample product API) is loading. */
export default function Loading() {
  return (
    <div className="pa-container py-10" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="aspect-[4/3] animate-pulse bg-surface-2" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-6 w-1/2 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">Loading products…</p>
    </div>
  );
}
