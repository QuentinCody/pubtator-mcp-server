import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const pubtatorCatalog: ApiCatalog = {
  name: "PubTator3",
  baseUrl: "https://www.ncbi.nlm.nih.gov/research/pubtator3-api",
  version: "3",
  endpointCount: 5,
  auth: "Public API; no API key configured. E-utilities API-key rate limits are not a verified PubTator contract.",
  notes: [
    "PubTator annotations and relations are automated text mining, not curated assertions or clinical evidence grades.",
    "Autocomplete search tokens beginning with @ differ from annotation database identifiers; retain both without inventing equivalence.",
    "Relations are ranked related-entity results, not a complete neighborhood. Counts do not establish causal direction or evidence quality.",
    "Use the local /publications/evidence view to retain the complete BioC envelope, document-scoped IDs and checked span candidates.",
    "No new 2026 API release established. Corpus counts in the 2024 methods paper are historical observations.",
    "Native reads verified 2026-10-04: full=true requests full text where available and may fall back to an abstract; the adapter omits full=false because upstream treats its presence as true. Preserve article-specific licenses.",
    "Search page numbering starts at 1; the observed native page_size is 10. size/page_size are ignored upstream and rejected locally. Autocomplete uses concept; legacy type is mapped to lowercase concept.",
  ].join(" "),
  endpoints: [
    {
      method: "GET", path: "/publications/evidence", category: "publications",
      summary: "Local lossless BioC evidence view with source-qualified IDs and span checks",
      description: "Fetches existing BioC JSON with a native byte-hash receipt, document manifest and missing-PMID coverage. Compound IDs stay intact. Relation role1/role2 participants join all exact same-document identity matches; these are not verified relation evidence sentences. Nodes accompanying those native identities remain uninterpreted. Span interpretations test UTF-8 bytes, Unicode code points and UTF-16 units; matching text does not verify the convention. This is an adapter view, not a new NCBI endpoint.",
      queryParams: [
        { name: "pmids", type: "string", required: true, description: "Comma-separated numeric PMIDs, at most 100. Start with one for full text; reads are bounded at 4 MiB." },
        { name: "full", type: "boolean", required: false, description: "true requests full text where available; false/omitted requests abstracts. Inspect native sections and licenses; full text may be unavailable." },
      ],
      responseShape: "{ source, retrieved_at, request, receipt:{source_url,response_sha256,byte_count,source_version:null}, documents, coverage, evidence_kind:'text_mined', curated_assertion:false, completeness:'returned_documents_only', native, mentions:[{document_index,document_id,record_id,annotation_id,path,text,identifier,entity_type,database,exact_source_key,native,spans}], relations:[{document_index,path,native,nodes,participants}], caveat }",
      example: 'return await api.get("/publications/evidence", {pmids:"34786492"});',
      usageHint: "Check __staged, __api_error and __stage_error before arrays. Staged tables: documents, passages, mentions, spans, relations, participants; native_json keeps original types/fields and payloads retains the full envelope. Join document_index plus exact_source_key; these are exact source/type/database/identifier matches, not universal IDs. Native document IDs can differ from PMIDs and request order.",
    },
    {
      method: "GET", path: "/publications/export/biocjson", category: "publications",
      summary: "Get entity-annotated articles in BioC JSON format",
      description: "Existing BioC export. The legacy adapter unwraps PubTator3 arrays; use /publications/evidence when collection metadata must be retained. Native document IDs need not equal PMIDs. Locations are document-relative; do not slice JavaScript strings without checking offset units.",
      queryParams: [
        { name: "pmids", type: "string", required: true, description: "Comma-separated PubMed IDs; request small batches (up to 100)." },
        { name: "full", type: "boolean", required: false, description: "true requests available full text; false/omitted requests abstracts. The adapter removes false upstream. Inspect returned sections, PMID/PMC fields and article license; full text can fall back to an abstract." },
      ],
      responseShape: "BioC documents (legacy PubTator3 wrapper unwrapped), or native collection object. Preserve infons, passages, sentences, annotations, locations and relations.",
      example: 'return await api.get("/publications/export/biocjson", {pmids:"38572754"});',
    },
    {
      method: "GET", path: "/search/", category: "search",
      summary: "Search PubTator-indexed articles by text, entity or relation query",
      description: "Returns native search results and paging metadata. Results establish retrieval matches, not curated assertions. Inspect the current response before assuming total counts or pagination completeness.",
      queryParams: [
        { name: "text", type: "string", required: true, description: "Free text or provider entity/relation search syntax." },
        { name: "page", type: "number", required: false, description: "Positive page number starting at 1. Inspect native current, count, total_pages and page_size (observed 10); size/page_size requests are unsupported.", default: 1 },
        { name: "sort", type: "string", required: false, description: "Provider sort selector." },
      ],
      responseShape: "Native search response with article hits and provider paging metadata.",
      example: 'return await api.get("/search/", {text:"TP53 cancer", page:1});',
    },
    {
      method: "GET", path: "/entity/autocomplete/", category: "entity",
      summary: "Find candidate PubTator entity search tokens and database identifiers",
      description: "Retain native ID fields (_id or id), biotype, db_id and name when supplied. Search suggestions may not denote the intended entity; inspect candidates before using an @ token.",
      queryParams: [
        { name: "query", type: "string", required: true, description: "Entity name such as BRCA1 or aspirin." },
        { name: "limit", type: "number", required: false, description: "Requested number of suggestions.", default: 10 },
        { name: "concept", type: "string", required: false, description: "Provider concept selector; gene verified natively. Legacy type:'Gene' maps to concept:'gene'. Inspect returned biotype; candidates can be ambiguous." },
      ],
      responseShape: "Native autocomplete suggestions; retain all ID/name/type fields.",
      example: 'return await api.get("/entity/autocomplete/", {query:"EGFR", limit:10});',
    },
    {
      method: "GET", path: "/relations", category: "relations",
      summary: "Find ranked, text-mined related entities",
      description: "NCBI's published integration documents a top-related-entity query. e1 is an @ token, e2 selects an entity type. Results are not exhaustive and do not provide curated evidence or verified sentence spans by themselves.",
      queryParams: [
        { name: "e1", type: "string", required: true, description: "Provider @ entity token, inspected from autocomplete; e.g. @GENE_JAK1." },
        { name: "e2", type: "string", required: true, description: "Related entity type; the methods paper uses Chemical. Do not assume this is a second entity identifier." },
        { name: "type", type: "string", required: true, description: "Provider relation filter.", enum: ["treat", "cause", "cotreat", "interact", "associate", "compare", "drug_interact", "stimulate", "inhibit", "negative_correlate", "positive_correlate", "prevent", "convert"] },
        { name: "limit", type: "number", required: false, description: "Requested related-entity limit; completeness is not guaranteed." },
      ],
      responseShape: "Native ranked relation response. Preserve returned entity tokens, relation labels and publication counts without inferring directionality beyond the provider fields.",
      example: 'return await api.get("/relations", {e1:"@GENE_JAK1", e2:"Chemical", type:"negative_correlate"});',
      usageHint: "Provider methods example: https://pmc.ncbi.nlm.nih.gov/articles/PMC11223843/ . Integration schema: https://github.com/ncbi-nlp/pubtator-gpt . Fetch supporting publications separately; co-occurrence is not a relation assertion.",
    },
  ],
  workflows: [
    {
      title: "Inspect source IDs and evidence spans for known publications",
      description: "Retain the native BioC payload and examine derived mentions without assuming a universal identifier namespace or offset convention.",
      keywords: ["entity", "identifier", "evidence", "span", "BioC", "provenance"],
      code: 'return await api.get("/publications/evidence", {pmids:"34786492"});',
    },
    {
      title: "Find candidate related chemicals for JAK1",
      description: "Use the provider's documented relation query; keep the response ranked and bounded rather than claiming complete graph coverage.",
      keywords: ["relation", "chemical", "JAK1", "negative_correlate"],
      code: 'return await api.get("/relations", {e1:"@GENE_JAK1", e2:"Chemical", type:"negative_correlate"});',
    },
    {
      title: "Inspect full-text entities and relation participants",
      description: "Request available PMC text while retaining original sections, licenses, document identifiers and the retrieval receipt. Large results stage automatically; query mentions and participants by document_index and exact_source_key.",
      keywords: ["full text", "PMC", "BioC", "relation", "evidence", "license"],
      code: 'return await api.get("/publications/evidence", {pmids:"34786492", full:true});',
    },
    {
      title: "Trace a ranked JAK1 relation to one supporting publication",
      description: "Keep autocomplete candidates, the ranked native source/target tokens, one relation-search page and one publication's BioC evidence. This bounded text-mining example does not establish causality or exhaustive support.",
      keywords: ["relation", "JAK1", "publication", "evidence", "join", "negative_correlate"],
      code: `const stop = x => x.__staged || x.__api_error || x.__stage_error;
const candidates = await api.get("/entity/autocomplete/", {query:"JAK1", concept:"gene", limit:5});
if (stop(candidates)) return candidates;
const selected = candidates.find(x => x._id === "@GENE_JAK1");
if (!selected) return {candidates, note:"Expected native JAK1 candidate absent; inspect candidates before selecting."};
const ranked = await api.get("/relations", {e1:selected._id,e2:"Chemical",type:"negative_correlate",limit:3});
if (stop(ranked)) return ranked;
const relation = ranked[0];
if (!relation) return {candidates,selected,ranked};
const text = "relations:" + relation.type + "|" + relation.source + "|" + relation.target;
const search = await api.get("/search/", {text,page:1});
if (stop(search)) return search;
const pmid = search.results?.[0]?.pmid;
if (!pmid) return {candidates,selected,ranked,text,search};
const evidence = await api.get("/publications/evidence", {pmids:String(pmid)});
if (evidence.__api_error || evidence.__stage_error) return evidence;
return {candidates,selected,ranked,text,search,evidence};`,
    },
    {
      title: "Inspect entity-resolution candidates",
      description: "Inspect candidate native PubTator tokens and database identifiers before selecting an entity.",
      keywords: ["autocomplete", "normalization", "identifier"],
      code: 'return await api.get("/entity/autocomplete/", {query:"aspirin", limit:10});',
    },
  ],
};
