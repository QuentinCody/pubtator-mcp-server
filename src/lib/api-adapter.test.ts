import { afterEach, describe, expect, it, vi } from "vitest";
import { createPubtatorApiFetch } from "./api-adapter";
const api = createPubtatorApiFetch();
afterEach(() => vi.unstubAllGlobals());
describe("PubTator evidence route", () => {
  it("keeps the source envelope while retaining the legacy array invocation", async () => {
    const native = { PubTator3: [{ id: "123", passages: [] }], release: "fixture" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
    const evidence = await api({ method: "GET", path: "/publications/evidence", params: { pmids: "123" } });
    expect(evidence.data).toMatchObject({ native, request: { pmids: "123" }, curated_assertion: false });
    expect((await api({ method: "GET", path: "/publications/export/biocjson", params: { pmids: "123" } })).data).toEqual(native.PubTator3);
  });
  it.each(["", "0", "1,", "abc", "1 2", Array(101).fill("1").join(",")])("rejects invalid/broad PMID requests before fetching %#", async pmids => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(api({ method: "GET", path: "/publications/evidence", params: { pmids } })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not silently turn POST into GET", async () => {
    await expect(api({ method: "POST", path: "/relations", body: {} })).rejects.toThrow("GET");
  });
  it.each(["https://example.com", "//example.com", "/relations#fragment", "/unrecognized", "/relations?e1=A&e1=B"])("rejects invalid paths or duplicate parameters %s", async path => {
    await expect(api({ method: "GET", path })).rejects.toThrow();
  });
  it("retains inline query invocation", async () => {
    const fetch = vi.fn(async () => Response.json({ documents: [] })); vi.stubGlobal("fetch", fetch);
    expect((await api({ method: "GET", path: "/publications/evidence?pmids=123" })).data).toMatchObject({ mentions: [] });
  });
  it.each(["/publications/evidence", "/publications/export/biocjson"])("normalizes full=false and true without truthiness coercion for %s", async path => {
    const fetch = vi.fn(async (_url: unknown) => Response.json({PubTator3:[]})); vi.stubGlobal("fetch",fetch);
    for (const value of [false,"false",true,"true"]) {
      await api({method:"GET",path,params:{pmids:"1",full:value}});
      const url = new URL(String(fetch.mock.calls[fetch.mock.calls.length - 1][0]));
      expect(url.searchParams.get("full")).toBe(value===true||value==="true"?"true":null);
    }
    await expect(api({method:"GET",path,params:{pmids:"1",full:"yes"}})).rejects.toMatchObject({status:400});
  });
  it("replaces the ignored autocomplete type filter with native concept", async () => {
    const fetch = vi.fn(async (_url: unknown) => Response.json([])); vi.stubGlobal("fetch",fetch);
    await api({method:"GET",path:"/entity/autocomplete/",params:{query:"EGFR",type:"Gene"}});
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("concept")).toBe("gene"); expect(url.searchParams.has("type")).toBe(false);
    await expect(api({method:"GET",path:"/entity/autocomplete/",params:{query:"EGFR",type:"Gene",concept:"chemical"}})).rejects.toMatchObject({status:400});
  });
  it.each([{size:3},{page_size:3},{page:0},{page:-1},{page:1.5}])("rejects misleading search pagination %#", async params => {
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    await expect(api({method:"GET",path:"/search/",params:{text:"TP53",...params}})).rejects.toMatchObject({status:400});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps invalid BioC envelopes and receipts as error evidence", async () => {
    const native={detail:"temporarily unavailable"}; vi.stubGlobal("fetch",vi.fn(async()=>Response.json(native)));
    await expect(api({method:"GET",path:"/publications/evidence",params:{pmids:"1"}})).rejects.toMatchObject({status:502,data:{native,receipt:{response_sha256:expect.any(String),source_version:null}}});
  });
});
