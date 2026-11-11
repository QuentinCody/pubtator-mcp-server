import { decodeResponseText, readResponseBytes } from "@bio-mcp/shared/http/response-reader";
const BASE = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api";

async function readBody(response: Response, source_url: string) {
  let bytes: Uint8Array; let raw: string;
  try {
    bytes = await readResponseBytes(response, { label: "PubTator", maxBytes: 4 * 1024 * 1024, timeoutMs: 10000 });
    raw = decodeResponseText(bytes, "PubTator");
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : 502;
    const message = status === 413 ? "PubTator response exceeds 4 MiB; request fewer publications" : status === 504 ? "PubTator body read exceeded 10 seconds" : String(error);
    throw Object.assign(new Error(message), { status: response.ok ? status : response.status,
      data: { source_url, http_status: response.status, body_unavailable: true, retry_after: response.headers.get("retry-after"), body_error: message } });
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const receipt = { source_url, retrieved_at: new Date().toISOString(), http_status: response.status,
    byte_count: bytes.byteLength, response_sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""),
    content_type: response.headers.get("content-type"), source_version: null };
  const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status,
    data: { raw_body: raw, receipt, retry_after: response.headers.get("retry-after") } }); };
  if (!response.ok) fail(`PubTator HTTP ${response.status}`, response.status);
  if (response.status !== 200 || response.headers.has("content-range")) fail("PubTator returned a partial representation", 502);
  if (!response.headers.get("content-type")?.includes("json")) fail("Expected PubTator JSON", 502);
  let native: unknown;
  try { native = JSON.parse(raw.replace(/^\uFEFF/, "")); }
  catch { fail("PubTator returned invalid JSON", 502); }
  return { native, receipt };
}

export async function readPubtatorWithReceipt(path: string, params: Record<string, unknown>) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error("PubTator read exceeded 30 seconds"), { status: 504, data: { source_url: url.href, body_unavailable: true } })); }, 30000);
  });
  try {
    const request = fetch(url, { signal: controller.signal, redirect: "manual", headers: { Accept: "application/json" } })
      .catch(() => { throw Object.assign(new Error("PubTator network request failed"), { status: 502, data: { source_url: url.href, body_unavailable: true } }); })
      .then(response => readBody(response, url.href));
    return await Promise.race([request, deadline]);
  } finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}

export async function readPubtator(path: string, params: Record<string, unknown>): Promise<unknown> {
  return (await readPubtatorWithReceipt(path, params)).native;
}
