import { afterEach, expect, it, vi } from "vitest";
import { readPubtator, readPubtatorWithReceipt } from "./read";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("encodes relation identifiers and preserves native JSON", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ PubTator3: [], version: "fixture" })); vi.stubGlobal("fetch", fetch);
  expect(await readPubtator("/relations", { e1: "@GENE_A&B", e2: "Chemical" })).toEqual({ PubTator3: [], version: "fixture" });
  const [url, options] = fetch.mock.calls[0];
  expect(url.origin).toBe("https://www.ncbi.nlm.nih.gov");
  expect(url.searchParams.get("e1")).toBe("@GENE_A&B"); expect(options.redirect).toBe("manual");
});
it.each([429, 500])("preserves status %s and the complete native error body", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>failure</html>", { status })));
  await expect(readPubtator("/search/", {})).rejects.toMatchObject({ status, message: `PubTator HTTP ${status}`, data: { raw_body: "<html>failure</html>", receipt: {http_status: status} } });
});

it("hashes exact UTF-8 source bytes separately from parsed evidence", async () => {
  const raw = '\uFEFF{ "text": "α😀", "id": "0001" }\n';
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(raw, {headers:{"content-type":"application/json"}})));
  const result = await readPubtatorWithReceipt("/publications/export/biocjson", {pmids:"1"});
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  expect(result.native).toEqual({text:"α😀",id:"0001"});
  expect(result.receipt).toMatchObject({byte_count:new TextEncoder().encode(raw).byteLength, source_version:null,
    response_sha256:Array.from(new Uint8Array(digest), x=>x.toString(16).padStart(2,"0")).join("")});
});

it.each([
  new Response("{}", {status:206,headers:{"content-type":"application/json"}}),
  new Response("{}", {headers:{"content-type":"application/json","content-range":"bytes 0-1/200"}}),
  new Response("{}", {headers:{"content-type":"text/html"}}),
  new Response("{", {headers:{"content-type":"application/json"}}),
  new Response(new Uint8Array([0xff]), {headers:{"content-type":"application/json"}}),
])("rejects partial, wrongly typed, malformed or invalid UTF-8 representations %#", async response => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(readPubtator("/search/", {})).rejects.toMatchObject({status:502});
});

it.each([200,429])("bounds stalled bodies even when cancellation never settles (%s)", async status => {
  vi.useFakeTimers();
  const stream = new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream,{status,headers:{"retry-after":"42"}})));
  const check = expect(readPubtator("/search/", {})).rejects.toMatchObject({status:status===200?504:status, data:{http_status:status,body_unavailable:true,retry_after:"42"}});
  await vi.advanceTimersByTimeAsync(10000); await check;
});

it("retains a network failure as unavailable evidence", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(readPubtator("/search/", {})).rejects.toMatchObject({status:502,data:{body_unavailable:true}});
});
it("rejects malformed successful JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>error</html>")));
  await expect(readPubtator("/search/", {})).rejects.toThrow();
});
it("bounds response bytes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ".repeat(4 * 1024 * 1024 + 1))));
  await expect(readPubtator("/search/", {})).rejects.toThrow("4 MiB");
});
it("bounds a stalled fetch", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const outcome = expect(readPubtator("/search/", {})).rejects.toThrow("30 seconds");
  await vi.advanceTimersByTimeAsync(30000); await outcome;
});
