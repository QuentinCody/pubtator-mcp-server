import { expect, it } from "vitest";
import native from "./native-abstract.fixture.json";
import { buildEvidence } from "./evidence";
import { pubtatorCompleteness } from "./completeness";

it("retains native relation roles and every exact same-document mention match", () => {
  const result = buildEvidence(native, {pmids:"34786492"});
  expect(result.mentions).toHaveLength(20); expect(result.relations).toHaveLength(2);
  expect(result.native).toEqual(native);
  expect(result.documents).toEqual([{document_index:0,document_id:"34786492",record_id:"34786492|None",pmid:34786492,pmcid:null,passage_count:2,mention_count:20,relation_count:2}]);
  expect(result.coverage.missing_requested_pmids).toEqual([]);
  const first = result.relations[0];
  expect(first.nodes).toEqual([{native:{refid:"0",role:"11,8"},resolution:"provider_specific_unverified",annotation_paths:[]}]);
  expect(first.participants.map(p=>p.native)).toEqual([native.PubTator3[0].relations[0].infons.role1,native.PubTator3[0].relations[0].infons.role2]);
  const [chemical, disease] = first.participants;
  expect(chemical).toMatchObject({identifier:"MESH:D013941",database:"ncbi_mesh",entity_type:"Chemical",resolution:"same_document_identity_matches",evidence_span_verified:false});
  expect(chemical.annotation_paths).toHaveLength(1); expect(disease.annotation_paths).toHaveLength(10);
  for (const p of [chemical,disease]) expect(p.annotation_paths).toEqual(result.mentions.filter(m=>m.exact_source_key===p.exact_source_key).map(m=>m.path));
  expect(result.mentions.every(m=>m.spans.length>0 && m.spans.every(s=>s.status==="text_match" && !s.offset_unit_verified))).toBe(true);
  expect(pubtatorCompleteness(result)).toMatchObject({complete:false,returned:1});
});

it("keeps provider-specific zero nodes unverified even when annotation zero exists", () => {
  const doc = structuredClone(native.PubTator3[0]); doc.passages[0].annotations[0].id = "0";
  const result = buildEvidence({PubTator3:[doc]}, {});
  expect(result.relations[0].nodes[0].resolution).toBe("provider_specific_unverified");
  expect(result.relations[0].nodes[0].annotation_paths).toEqual([]);
});

it("reports omitted requests using only native pmid, without zipping reordered results or parsing IDs", () => {
  const docs = [{id:"PMC2",_id:"1|PMC2",pmid:2,pmcid:"PMC2",passages:[]}, {id:"1",_id:"1|None",passages:[]}];
  const result = buildEvidence(docs,{pmids:"1,2,3",full:true});
  expect(result.coverage).toMatchObject({requested_pmids:["1","2","3"],returned_pmids:["2"],missing_requested_pmids:["1","3"],documents_without_pmid:1,full_text_requested:true});
  expect(result.documents.map(d=>d.document_id)).toEqual(["PMC2","1"]);
});

it("does not join participant identities across database, type, compound ID or document boundaries", () => {
  const role={identifier:"001",type:"Gene",database:"ncbi_gene"};
  const annotations = [role,{...role,database:"other"},{...role,type:"Chemical"},{...role,identifier:"001;002"}].map((infons,i)=>({id:String(i),infons}));
  const result=buildEvidence([{passages:[{annotations}],relations:[{infons:{role1:role,role2:{...role,identifier:"-"}}}]},{passages:[],relations:[{infons:{role1:role}}]}],{});
  expect(result.relations.map(r=>r.participants.map(p=>p.annotation_paths))).toEqual([[["/passages/0/annotations/0"],[]],[[]]]);
});

it("keeps search pages, ranked limits and composed scopes explicitly incomplete", () => {
  expect(pubtatorCompleteness({results:[{pmid:1}],page_size:10,current:1,count:33,total_pages:4})).toMatchObject({complete:false,returned:1,total_available:33});
  expect(pubtatorCompleteness([])).toMatchObject({complete:false,returned:0});
  expect(pubtatorCompleteness({ranked:[{publications:300}],search:{results:[],count:0}})).toMatchObject({complete:false});
  expect(pubtatorCompleteness({ranked:[{publications:300}],search:{results:[],count:0}})).not.toHaveProperty("returned");
});
