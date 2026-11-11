import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { fixture, recover } from "./staging-fixture";
import native from "../lib/native-abstract.fixture.json";
import { pubtatorCatalog } from "../spec/catalog";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function invoke(f: ReturnType<typeof fixture>, name: string, args: unknown, failed = false) {
  const result = await f.tools[name].handler(args, {});
  expect(result.isError === true, JSON.stringify(result).slice(0,1000)).toBe(failed);
  const sc = result.structuredContent; let original = sc; let materialized: unknown;
  if (sc.staged) { const full=await recover(f,sc.data_access_id,""); materialized=full; original=full.structuredContent; }
  let data=original.data;
  if (data?.__staged) { data=await recover(f,data.data_access_id,""); materialized??=data; }
  const proof=await verifyCitationEnvelope({citation:sc._meta.citation,structuredContent:sc,toolArguments:args,...(materialized?{materialized:{value:materialized}}:{})});
  expect(proof.verification).toMatchObject({query:"verified",result:"verified"});
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(30720);
  return {sc,data,id:original.data?.data_access_id??sc.data_access_id};
}

it.each(["","mcp_"])("keeps native BioC, exact joins and TEXT identifiers through %s Code Mode/SQLite", async prefix => {
  const f=fixture(); const source={...native,future:{opaque:["001",null,0],text:"α😀".repeat(10000)}};
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(source)));
  try {
    const result=await invoke(f,prefix+"pubtator_execute",{code:'return await api.get("/publications/evidence",{pmids:"34786492"});'});
    expect(result.data.native).toEqual(source); expect(result.id).toMatch(/^pubtator_/);
    expect(result.sc._meta.completeness).toMatchObject({complete:false,returned:1});
    expect(result.sc._staging?.completeness??result.sc.data._staging.completeness).toMatchObject({complete:false});
    const schema=await invoke(f,prefix+"pubtator_get_schema",{data_access_id:result.id});
    expect(Object.keys(schema.data.schema.tables)).toEqual(expect.arrayContaining(["documents","passages","mentions","spans","relations","participants","payloads"]));
    const ids=await invoke(f,prefix+"pubtator_query_data",{data_access_id:result.id,sql:"SELECT document_id,pmid,typeof(document_id) AS id_type,typeof(pmid) AS pmid_type FROM documents"});
    expect(ids.data.rows).toEqual([{document_id:"34786492",pmid:"34786492",id_type:"text",pmid_type:"text"}]);
    const joins=await invoke(f,prefix+"pubtator_query_data",{data_access_id:result.id,sql:"SELECT p.relation_path,p.role,m.path FROM participants p JOIN mentions m ON p.document_index=m.document_index AND p.exact_source_key=m.exact_source_key ORDER BY p.relation_path,p.role,m.path"});
    const expected=result.data.relations.flatMap((r:any)=>r.participants.flatMap((p:any)=>p.annotation_paths.map((path:string)=>({relation_path:r.path,role:p.role,path}))));
    expected.sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(joins.data.rows).toEqual(expected);
    const mentions=await invoke(f,prefix+"pubtator_query_data",{data_access_id:result.id,sql:"SELECT native_json FROM mentions ORDER BY _rowid",limit:100});
    expect(mentions.data.rows.map((r:any)=>JSON.parse(r.native_json))).toEqual(native.PubTator3[0].passages.flatMap(p=>p.annotations));
    const relations=await invoke(f,prefix+"pubtator_query_data",{data_access_id:result.id,sql:"SELECT native_json,nodes_json FROM relations ORDER BY _rowid"});
    expect(relations.data.rows.map((r:any)=>JSON.parse(r.native_json))).toEqual(native.PubTator3[0].relations);
    expect(relations.data.rows.map((r:any)=>JSON.parse(r.nodes_json)[0].resolution)).toEqual(["provider_specific_unverified","provider_specific_unverified"]);
  } finally { f.close(); }
});

it("retains complete native failures and invalid envelopes with bounded, verifiable error results", async () => {
  const f=fixture(); const body=JSON.stringify({detail:"native failure "+"α".repeat(22000)});
  try {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(body,{status:400,headers:{"content-type":"application/json"}})));
    const result=await invoke(f,"pubtator_execute",{code:'return await api.get("/publications/evidence",{pmids:"999999999"});'},true);
    const data=result.data.data.__staged?await recover(f,result.data.data.data_access_id,""):result.data.data;
    expect(data.raw_body).toBe(body); expect(data.receipt.http_status).toBe(400);
    vi.mocked(fetch).mockImplementation(async()=>Response.json({unexpected:"native"}));
    const invalid=await invoke(f,"mcp_pubtator_execute",{code:'return await api.get("/publications/evidence",{pmids:"1"});'},true);
    expect(invalid.data.data.native).toEqual({unexpected:"native"});
    vi.mocked(fetch).mockImplementation(async()=>Response.json({PubTator3:[]}));
    const empty=await invoke(f,"pubtator_execute",{code:'return await api.get("/publications/evidence",{pmids:"1"});'});
    expect(empty.data.coverage.missing_requested_pmids).toEqual(["1"]);
    expect(empty.sc._meta.completeness).toMatchObject({complete:false,returned:0});
  } finally {f.close();}
});

it("cites discovery, storage and execution errors using the exact caller arguments", async () => {
  const f=fixture();
  try {
    expect(Object.keys(f.tools).sort()).toEqual(["search","execute","query_data","get_schema"].flatMap(name=>["pubtator_"+name,"mcp_pubtator_"+name]).sort());
    for (const prefix of ["","mcp_"]) {
      await invoke(f,prefix+"pubtator_search",{query:"evidence",max_results:3});
      await invoke(f,prefix+"pubtator_query_data",{data_access_id:"missing",sql:"SELECT * FROM missing"},true);
      await invoke(f,prefix+"pubtator_get_schema",{data_access_id:"missing"});
      await invoke(f,prefix+"pubtator_execute",{code:""},true);
    }
  } finally {f.close();}
});

it.each([{__staged:true,data_access_id:"known"},{__api_error:true},{__stage_error:true}])("stops the supporting-publication recipe on a handle/error before using arrays %#", async handle => {
  const api={get:vi.fn().mockResolvedValue(handle)};
  const workflow=pubtatorCatalog.workflows!.find(w=>w.title.startsWith("Trace a ranked"))!;
  expect(await new Function("api",`return (async()=>{${workflow.code}})()`)(api)).toEqual(handle);
  expect(api.get).toHaveBeenCalledTimes(1);
});
