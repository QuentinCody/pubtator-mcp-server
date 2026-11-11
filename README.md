# PubTator MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream PubTator API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://pubtator-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "pubtator": {
      "command": "npx",
      "args": ["mcp-remote", "https://pubtator-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8854/mcp` (start it with `./scripts/dev-servers.sh pubtator`):

```json
{
  "mcpServers": {
    "pubtator-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8854/mcp"]
    }
  }
}
```

## Tools

- `pubtator_search` — discover four upstream operations and the local evidence view
- `pubtator_execute` — **Code Mode**: use `api.get()` and `searchSpec()` in a V8 isolate; the catalog supports GET only
- `pubtator_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `pubtator_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.
Each tool also has an `mcp_pubtator_*` alias.

## Evidence and identifier context

```javascript
return await api.get("/publications/evidence", { pmids: "34786492", full: true });
```

This local adapter route fetches the existing BioC JSON export and retains its complete
response under `native`, including collection metadata, passages and original relations.
The legacy `/publications/export/biocjson` route keeps its established array unwrapping.
The evidence route accepts up to 100 numeric PMIDs. Start with one for full text: reads
are bounded at 4 MiB. `full:true` requests available PMC text; false/omitted requests
abstracts. The adapter omits `full:false` upstream because NCBI treats even that value
as a full-text request. Full-text requests can fall back to abstracts. Inspect native
sections and article-specific licenses; article text is not uniformly public domain.

`receipt` records the request URL, retrieval time, HTTP status, byte count and SHA-256
of the original UTF-8 response. It is separate from the tool's canonical-result citation;
no pinned provider release is asserted. `documents` retains native PMID, PMCID, document
and record IDs. `coverage` matches requested PMIDs against native `pmid` fields, records
omissions and preserves response order. Document IDs need not be PMIDs. Annotation,
passage and relation counts do not prove full-text or corpus completeness.

Derived mentions retain annotation IDs, document/record IDs, source paths, type, database
and the original identifier. Compound IDs remain intact. `exact_source_key` supports only
exact source/type/database/identifier joins; it is not a universal identifier mapping.
Native relation `role1`/`role2` identities join **all** exact matches within their document.
These joins do not identify a verified evidence sentence. Nodes accompanying those roles
remain uninterpreted: native numeric `refid` values can collide with annotation IDs but
are not verified annotation references. Other BioC node references match only unique
annotation IDs within their document; missing/duplicate references remain unresolved/
ambiguous. Co-occurrence does not create an edge.

Staged evidence exposes `documents`, `passages`, `mentions`, `spans`, `relations` and
`participants`, plus `evidence_context`. Join `document_index` and `exact_source_key`,
not annotation IDs across documents. Identifier columns are SQL TEXT; `native_json`
retains original scalar types and fields. `payloads` retains the complete response,
including unknown metadata. Empty projections need not produce a table. Inspect schema
before querying, and check `__staged`, `__api_error` and `__stage_error` before arrays.

Span checks subtract the containing passage/sentence offset and test UTF-8 bytes,
Unicode code points and UTF-16 units. They preserve every location, report mismatches,
and leave discontinuous spans unverified. A text match does not prove the provider's
offset convention. Inspect the original text before treating a span as evidence.

PubTator results are automated text mining, not curated assertions. The relation catalog
now follows NCBI's related-entity query (`e1` token, `e2` entity type, relation `type`);
ranked results must not be described as a complete graph. Sources:
[PubTator methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC11223843/),
[NCBI integration schema](https://github.com/ncbi-nlp/pubtator-gpt), and
[BioC format](https://pmc.ncbi.nlm.nih.gov/articles/PMC3889917/).

Search starts at page 1 and retains native `current`, `count`, `total_pages` and
`page_size` (observed 10). Unsupported `size`/`page_size` requests are rejected rather
than pretending NCBI honored them. Autocomplete uses `concept` (`gene` verified);
legacy `type:"Gene"` maps to `concept:"gene"`. Retain suggestion `_id` search tokens
separately from `db_id`, normalized IDs and native relation source/target orientation.

Native/local acceptance on 2026-10-04 recovered abstract and full-text evidence through
the bundled Worker's real Code Mode, Durable Object and SQL tools. PMID 34786492 returned
20 abstract mentions/two relations; PMC8579115 returned 82 passages, 335 mentions and
two relations. All 335 full-text mentions had matching span candidates; this does not
verify the offset convention. Five recipes passed, including autocomplete → ranked
relation → supporting-publication search → BioC for PMID 36142375. Missing PMIDs,
full-text fallback, paging, native errors, citations and 30 KiB staging were checked.
The 82 focused tests include replay of `src/lib/native-abstract.fixture.json`, captured
from NCBI's export on this date, plus synthetic boundary cases and real SQLite storage.
See the [implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md)
for final gates and receipts. This verifies a local bundle; it does not assert deployment
or a new 2026 API release.

## Development

```bash
./scripts/dev-servers.sh pubtator            # run locally (port 8854)
pnpm --filter pubtator-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from PubTator3 and stays under the terms of that source: NCBI annotations; underlying text may be copyrighted.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
