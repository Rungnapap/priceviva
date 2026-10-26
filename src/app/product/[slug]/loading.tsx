export default function LoadingProduct() {
  return (
    <div className="pa-container grid gap-10 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true" aria-label="Loading product">
      <div className="aspect-square animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
        <div className="h-8 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-20 animate-pulse rounded bg-surface-2" />
        <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      </div>
    </div>
  );
}
