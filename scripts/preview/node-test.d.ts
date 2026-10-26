// Minimal typings so the logic type-check runs without @types/node in the sandbox.
declare module "node:test" { export function test(name: string, fn: () => void | Promise<void>): void; }
declare module "node:assert/strict" { const a: { (v: unknown, m?: string): void; ok(v: unknown, m?: string): void; equal(a: unknown, b: unknown, m?: string): void; deepEqual(a: unknown, b: unknown, m?: string): void; match(s: string, r: RegExp): void; }; export default a; }
