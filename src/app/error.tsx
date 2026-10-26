"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="pa-container py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">The page couldn’t load. Your saved preferences are safe in this browser.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">
        Try again
      </button>
    </div>
  );
}
