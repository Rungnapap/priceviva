/** File access for sample mode (server-only). Kept separate so tests and the sandbox preview can replace it. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Project folder at run time. The `turbopackIgnore` comments tell Next.js's file tracer not to treat these
 * run-time paths as build inputs (otherwise it traces the whole project and warns). Files are still read at run time.
 */
const fromRoot = (...parts: string[]) => path.join(/* turbopackIgnore: true */ process.cwd(), ...parts);

export async function readSampleOffersCsv(): Promise<string | null> {
  const p = process.env.SAMPLE_OFFERS_CSV?.trim() || fromRoot("data", "sample-offers.csv");
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

const cacheFile = () => fromRoot(".data", "dummyjson-products.json");

/** Last good DummyJSON response, used when the API is unreachable. */
export async function readDummyCache(): Promise<{ savedAt: string; json: unknown } | null> {
  try {
    return JSON.parse(await readFile(cacheFile(), "utf8")) as { savedAt: string; json: unknown };
  } catch {
    return null;
  }
}

export async function writeDummyCache(json: unknown): Promise<void> {
  try {
    await mkdir(path.dirname(cacheFile()), { recursive: true });
    await writeFile(cacheFile(), JSON.stringify({ savedAt: new Date().toISOString(), json }));
  } catch {
    /* read-only hosting: run without a disk cache */
  }
}

const obsFile = () => fromRoot(".data", "price-observations.json");

/** Recorded sample-offer price observations (test mode only). */
export async function readObservations(): Promise<unknown[]> {
  try {
    const j = JSON.parse(await readFile(obsFile(), "utf8")) as unknown;
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export async function writeObservations(rows: unknown[]): Promise<void> {
  try {
    await mkdir(path.dirname(obsFile()), { recursive: true });
    await writeFile(obsFile(), JSON.stringify(rows));
  } catch {
    /* read-only hosting: history is then kept in memory only */
  }
}
