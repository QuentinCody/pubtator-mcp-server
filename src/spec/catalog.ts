import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const pubtatorCatalog: ApiCatalog = {
	name: "PubTator3",
	baseUrl: "https://www.ncbi.nlm.nih.gov/research/pubtator3-api",
	version: "3",
	endpointCount: 3,
	auth: "No auth required. Optional NCBI API key improves rate limits from 3 to 10 req/sec.",
	notes: [
		"PubTator3 provides automated biomedical entity annotations (Gene, Disease, Chemical, Species, Variant) for PubMed articles.",
		"Entity IDs are normalized: Gene → NCBI Gene ID, Disease → MeSH, Chemical → MeSH, Species → NCBI Taxonomy, Variant → rsID + HGVS.",
		"~8 million articles are annotated (not all of PubMed's 36M+).",
		"BioC JSON format nests annotations inside passages with exact text spans (offsets).",
		"The publications/export endpoint is the most reliable; the search endpoint can be intermittent.",
		"For multiple PMIDs, comma-separate them (up to ~100 per request).",
	].join(" "),
	endpoints: [
		{
			method: "GET",
			path: "/publications/export/biocjson",
			summary: "Get entity-annotated articles in BioC JSON format",
			description:
				"Retrieve NLP-annotated articles with Gene, Disease, Chemical, Species, and Variant entities linked to normalized database IDs. " +
				"Each article contains passages (title + abstract) with annotations that include entity type, text mention, normalized identifiers, and character offsets. " +
				"This is the core value of PubTator3 — structured entity extraction from biomedical literature.",
			category: "publications",
			queryParams: [
				{
					name: "pmids",
					type: "string",
					required: true,
					description: "Comma-separated PubMed IDs (e.g. '33205991,33306226'). Up to ~100 per request.",
				},
				{
					name: "full",
					type: "boolean",
					required: false,
					description: "Include full text annotations (not just title/abstract). Default: false.",
					default: false,
				},
			],
			responseShape: `Array<{
  _id: string;        // PMID
  pmid: number;
  passages: Array<{
    infons: { type: "title" | "abstract"; section_type: string };
    offset: number;
    text: string;
    annotations: Array<{
      id: string;
      infons: {
        identifier: string;  // Normalized ID (e.g. "7157" for TP53, "MESH:D009369" for Neoplasms)
        type: "Gene" | "Disease" | "Chemical" | "Species" | "Variant";
        database?: string;
      };
      text: string;          // Mention text in the article
      locations: Array<{ offset: number; length: number }>;
    }>;
  }>;
}>`,
			example: `// Get annotations for a single article
const result = await api.get("/publications/export/biocjson", { pmids: "33205991" });
const articles = result;
for (const article of articles) {
  for (const passage of article.passages) {
    for (const ann of passage.annotations) {
      console.log(ann.infons.type, ann.text, ann.infons.identifier);
    }
  }
}`,
			usageHint:
				"Use this to extract structured entities from known PMIDs. Combine with Entrez/PubMed search to first find relevant PMIDs, then annotate them here.",
		},
		{
			method: "GET",
			path: "/search/",
			summary: "Search PubTator-indexed articles by text query",
			description:
				"Search across PubTator3's indexed articles by free text. Returns matching articles with PMIDs, titles, journals, dates, and relevance scores. " +
				"NOTE: This endpoint can be intermittent and may return errors. For reliable article search, prefer using Entrez/PubMed search tools and then fetch annotations via the publications endpoint.",
			category: "search",
			queryParams: [
				{
					name: "text",
					type: "string",
					required: true,
					description: "Search query text (e.g. 'BRCA1 breast cancer').",
				},
				{
					name: "page",
					type: "number",
					required: false,
					description: "Page number starting from 1.",
					default: 1,
				},
				{
					name: "size",
					type: "number",
					required: false,
					description: "Results per page, 1-100.",
					default: 10,
				},
				{
					name: "sort",
					type: "string",
					required: false,
					description: "Sort order for results.",
				},
			],
			responseShape: `{
  results: Array<{
    pmid: string;
    title: string;
    journal: string;
    date: string;
    score: number;
    authors?: string[];
  }>;
  total: number;
  page: number;
}`,
			example: `// Search for articles about TP53 and cancer
const result = await api.get("/search/", { text: "TP53 cancer", size: 20 });
console.log("Total hits:", result.total);
for (const article of result.results) {
  console.log(article.pmid, article.title, article.score);
}`,
			usageHint:
				"This endpoint can be unreliable. For robust article search, prefer Entrez PubMed search and then use the /publications/export/biocjson endpoint to get annotations.",
		},
		{
			method: "GET",
			path: "/entity/autocomplete/",
			summary: "Resolve entity names to normalized biomedical IDs",
			description:
				"Maps text queries to normalized biomedical entity identifiers. Returns entity type (Gene, Disease, Chemical, Species, Variant), " +
				"database ID, and canonical name. Useful for entity name resolution before querying other databases.",
			category: "entity",
			queryParams: [
				{
					name: "query",
					type: "string",
					required: true,
					description: "Entity name to resolve (e.g. 'BRCA1', 'aspirin', 'breast cancer').",
				},
				{
					name: "type",
					type: "string",
					required: false,
					description: "Filter by entity type: Gene, Disease, Chemical, Species, Variant.",
					enum: ["Gene", "Disease", "Chemical", "Species", "Variant"],
				},
			],
			responseShape: `Array<{
  biotype: "Gene" | "Disease" | "Chemical" | "Species" | "Variant";
  db_id: string;     // Normalized ID (e.g. "672" for BRCA1, "MESH:D001943" for Breast Neoplasms)
  name: string;       // Canonical entity name
  count?: number;     // Number of PubTator articles mentioning this entity
}>`,
			example: `// Resolve an entity name
const results = await api.get("/entity/autocomplete/", { query: "BRCA1", type: "Gene" });
for (const entity of results) {
  console.log(entity.biotype, entity.name, entity.db_id);
}`,
			usageHint:
				"Use this for entity name normalization — map free text to standard IDs before querying Gene, MeSH, or Taxonomy databases.",
		},
	],
	workflows: [
		{
			title: "Extract all entities from a set of PMIDs",
			description:
				"Given a list of PMIDs, fetch BioC JSON annotations and aggregate all unique entities by type with their frequencies.",
			keywords: ["entity extraction", "NER", "annotation", "aggregate", "frequency"],
			code: `// Extract and aggregate entities from multiple articles
const pmids = "33205991,35953817,36055877";
const articles = await api.get("/publications/export/biocjson", { pmids });

const entityMap = new Map();
for (const article of articles) {
  for (const passage of article.passages) {
    for (const ann of passage.annotations) {
      const key = ann.infons.type + ":" + ann.infons.identifier;
      if (!entityMap.has(key)) {
        entityMap.set(key, { type: ann.infons.type, id: ann.infons.identifier, text: ann.text, count: 0 });
      }
      entityMap.get(key).count++;
    }
  }
}

// Sort by frequency
const entities = [...entityMap.values()].sort((a, b) => b.count - a.count);
return { total_entities: entities.length, top_entities: entities.slice(0, 50) };`,
		},
		{
			title: "Resolve entity and find annotated articles",
			description:
				"First resolve an entity name to its normalized ID via autocomplete, then search for articles mentioning it.",
			keywords: ["entity resolution", "name normalization", "search", "lookup"],
			code: `// Resolve "aspirin" to its MeSH ID, then search for annotated articles
const entities = await api.get("/entity/autocomplete/", { query: "aspirin", type: "Chemical" });
const topEntity = entities[0];
console.log("Resolved:", topEntity.name, topEntity.db_id);

// Search for articles about this entity
const results = await api.get("/search/", { text: topEntity.name, size: 10 });
return { entity: topEntity, articles: results };`,
		},
	],
};
