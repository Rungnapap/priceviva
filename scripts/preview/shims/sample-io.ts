// Sandbox preview: read the real data/sample-offers.csv over HTTP; no disk cache in the browser.
export async function readSampleOffersCsv(): Promise<string | null> {
  try {
    const r = await fetch("/data/sample-offers.csv");
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
export async function readDummyCache(): Promise<null> {
  return null;
}
export async function writeDummyCache(): Promise<void> {}
let obs: unknown[] = [];
export async function readObservations(): Promise<unknown[]> {
  return obs;
}
export async function writeObservations(rows: unknown[]): Promise<void> {
  obs = rows;
}
