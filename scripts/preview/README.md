# Sandbox preview harness (not part of the app)

Used only in the build sandbox, where the npm registry was unreachable and Next.js
could not be installed. It bundles the real `src/` pages with esbuild and renders
them client-side, swapping in tiny stand-ins for `next/link`, `next/navigation`,
`next/font/google` and `lucide-react` (approximate icon drawings).

On your own computer, use the real app instead: `npm install && npm run dev`.
This folder is excluded from TypeScript and ESLint, and safe to delete.
