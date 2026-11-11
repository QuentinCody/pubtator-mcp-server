import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";
import { buildEvidence, documents, row } from "./lib/evidence";
import { record } from "./lib/completeness";

const TEXT_IDS = ["_id", "id", "document_id", "record_id", "pmid", "pmcid", "annotation_id", "relation_id", "identifier", "db_id", "exact_source_key"];
const identifiers = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, TEXT_IDS.includes(key) && item !== null && item !== undefined ? String(item) : item]));
const nativeRow = (value: unknown) => ({ ...identifiers(Object.fromEntries(Object.entries(row(value)).filter(([, item]) => item === null || typeof item !== "object"))), native_json: JSON.stringify(value) });

function evidenceTables(data: ReturnType<typeof buildEvidence>) {
  const docs = documents(data.native);
  return {
    evidence_context: [{ request_json: JSON.stringify(data.request), coverage_json: JSON.stringify(data.coverage), receipt_json: JSON.stringify(row(data).receipt ?? null) }],
    documents: data.documents.map((doc, index) => ({ ...identifiers(doc), native_json: JSON.stringify(docs[index]) })),
    passages: docs.flatMap((doc, document_index) => (doc.passages as unknown[]).map((passage, passage_index) => ({
      document_index, passage_index, offset: row(passage).offset, text: row(passage).text, native_json: JSON.stringify(passage) }))),
    mentions: data.mentions.map(mention => {
      const { spans: _spans, native, ...fields } = mention; return { ...identifiers(fields), native_json: JSON.stringify(native) };
    }),
    spans: data.mentions.flatMap(mention => mention.spans.map((span, span_index) => ({ document_index: mention.document_index,
      annotation_path: mention.path, span_index, status: span.status, offset_unit_verified: false, native_json: JSON.stringify(span) }))),
    relations: data.relations.map(relation => ({ document_index: relation.document_index, path: relation.path,
      relation_id: row(relation.native).id, type: row(row(relation.native).infons).type, evidence_kind: relation.evidence_kind,
      curated_assertion: false, nodes_json: JSON.stringify(relation.nodes), native_json: JSON.stringify(relation.native) })),
    participants: data.relations.flatMap(relation => relation.participants.map(participant => {
      const { native, annotation_paths, ...fields } = participant;
      return { document_index: relation.document_index, relation_path: relation.path, ...fields,
        annotation_paths_json: JSON.stringify(annotation_paths), native_json: JSON.stringify(native) };
    })),
  };
}

export class PubtatorDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent ? value.structuredContent.data : value;
    if (record(data)) {
      if (typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(nativeRow) };
      if (data.source === "PubTator3" && Array.isArray(data.mentions) && Array.isArray(data.documents)) return evidenceTables(data as ReturnType<typeof buildEvidence>);
      if (Array.isArray(data.PubTator3) || Array.isArray(data.documents) || Array.isArray(data.passages)) return evidenceTables(buildEvidence(data, {}));
      if (Array.isArray(data.results)) return { search_results: data.results.map(nativeRow) };
    }
    if (Array.isArray(data) && data.length) {
      if (data.every(item => Array.isArray(row(item).passages))) return evidenceTables(buildEvidence(data, {}));
      const first = row(data[0]);
      const table = "biotype" in first && "db_id" in first ? "autocomplete_results"
        : "source" in first && "target" in first ? "ranked_relations" : "pmid" in first ? "search_results" : "observations";
      return { [table]: data.map(nativeRow) };
    }
    return data;
  }

  protected getSchemaHints(): SchemaHints {
    return { columnTypes: Object.fromEntries([...TEXT_IDS, "native_json"].map(name => [name, "TEXT"])) };
  }
}
