/**
 * Stream a (possibly gzip-compressed) CSV download as text chunks without loading it all into memory.
 */
export async function* streamText(
  res: Response,
  opts: { maxBytes?: number } = {},
): AsyncGenerator<string> {
  if (!res.body) throw new Error("Empty response body");
  const maxBytes = opts.maxBytes ?? 4 * 1024 ** 3;
  const reader = res.body.getReader();
  const first = await reader.read();
  if (first.done || !first.value) return;
  const head = first.value;
  const gzip = head[0] === 0x1f && head[1] === 0x8b;

  let bytes = 0;
  const raw = new ReadableStream<Uint8Array>({
    start(controller) {
      bytes += head.byteLength;
      controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        controller.error(new Error(`Download exceeds ${maxBytes} bytes; aborting.`));
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      return reader.cancel();
    },
  });

  const decoded = (gzip ? raw.pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>) : raw).pipeThrough(
    new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>,
  );
  const textReader = decoded.getReader();
  for (;;) {
    const { done, value } = await textReader.read();
    if (done) return;
    if (value) yield value;
  }
}

export async function downloadFeed(url: string, timeoutMs = 15 * 60_000): Promise<AsyncGenerator<string>> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { "Accept-Encoding": "gzip" } });
  if (!res.ok) throw new Error(`Feed download failed with HTTP ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html")) throw new Error("Feed download returned an HTML page instead of CSV (check feed access / API key).");
  return streamText(res);
}
