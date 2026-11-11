import { evidenceSpans } from "./evidence-spans";
type Row = Record<string, unknown>;
export const row = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function documents(native: unknown): Row[] {
  if (Array.isArray(native)) return native.flatMap(documents);
  const value = row(native);
  if (Array.isArray(value.PubTator3)) return value.PubTator3.flatMap(documents);
  if (Array.isArray(value.documents)) return value.documents.flatMap(documents);
  if (Array.isArray(value.passages)) return [value];
  throw new Error("Unrecognized BioC document envelope; no evidence view generated");
}

function containers(document: Row) {
  const result = [{ value: document, path: "", passage: null as number | null }];
  list(document.passages).forEach((passage, p) => {
    const value = row(passage);
    result.push({ value, path: `/passages/${p}`, passage: p });
    list(value.sentences).forEach((sentence, s) => { result.push({ value: row(sentence), path: `/passages/${p}/sentences/${s}`, passage: p }); });
  });
  return result;
}

function identity(infons: Row) {
  const identifier = infons.identifier ?? null;
  const entity_type = infons.type ?? null;
  const database = infons.database ?? null;
  const usable = typeof identifier === "string" && identifier.length > 0 && identifier !== "-" && typeof entity_type === "string";
  return { identifier, entity_type, database,
    exact_source_key: usable ? JSON.stringify(["PubTator3", entity_type, database, identifier]) : null,
    join_scope: "Exact source/type/database/identifier equality only; compound IDs remain intact; no cross-database equivalence inferred" };
}

function mentions(document: Row, document_index: number) {
  return containers(document).flatMap(container => list(container.value.annotations).map((value, index) => {
    const annotation = row(value);
    return { document_index, document_id: document.id ?? null, record_id: document._id ?? null,
      annotation_id: annotation.id ?? null, path: `${container.path}/annotations/${index}`,
      ...(document.pmid === undefined ? {} : { pmid: document.pmid }), ...(document.pmcid === undefined ? {} : { pmcid: document.pmcid }),
      passage_index: container.passage, text: annotation.text ?? null, ...identity(row(annotation.infons)), native: value,
      spans: evidenceSpans(annotation, container.value) };
  }));
}

function resolveNode(value: unknown, items: ReturnType<typeof mentions>, providerRoles: boolean) {
  const node = row(value);
  // Native PubTator uses numeric relation/node indices with provider-specific role strings, not verified annotation references.
  if (providerRoles) return { native: value, resolution: "provider_specific_unverified", annotation_paths: [] };
  const targets = typeof node.refid === "string" ? items.filter(item => item.annotation_id === node.refid) : [];
  return { native: value, resolution: targets.length === 1 ? "resolved_annotation" : targets.length ? "ambiguous" : "unresolved",
    annotation_paths: targets.map(target => target.path) };
}

function participants(relation: Row, items: ReturnType<typeof mentions>) {
  const infons = row(relation.infons);
  return ["role1", "role2"].filter(role => Object.keys(row(infons[role])).length > 0).map(role => {
    const native = row(infons[role]); const entity = identity(native);
    const targets = entity.exact_source_key === null ? [] : items.filter(item => item.exact_source_key === entity.exact_source_key);
    return { role, native, ...entity, annotation_paths: targets.map(target => target.path),
      resolution: targets.length ? "same_document_identity_matches" : "unresolved",
      evidence_span_verified: false };
  });
}

function documentEvidence(document: Row, document_index: number) {
  const annotations = mentions(document, document_index);
  const relations = containers(document).flatMap(container => list(container.value.relations).map((value, index) => {
    const relation = row(value);
    const roles = participants(relation, annotations);
    return { document_index, path: `${container.path}/relations/${index}`, native: value,
      participants: roles, nodes: list(relation.nodes).map(node => resolveNode(node, annotations, roles.length > 0)),
      evidence_kind: "text_mined", curated_assertion: false };
  }));
  return { annotations, relations };
}

export function buildEvidence(native: unknown, request: Record<string, unknown>) {
  const docs = documents(native); const views = docs.map(documentEvidence);
  const requested = typeof request.pmids === "string" ? request.pmids.split(",") : [];
  const returned = docs.flatMap(doc => typeof doc.pmid === "string" || typeof doc.pmid === "number" ? [String(doc.pmid)] : []);
  return { source: "PubTator3", retrieved_at: new Date().toISOString(), request,
    evidence_kind: "text_mined", curated_assertion: false, completeness: "returned_documents_only",
    documents: docs.map((doc, document_index) => ({ document_index, document_id: doc.id ?? null, record_id: doc._id ?? null,
      pmid: doc.pmid ?? null, pmcid: doc.pmcid ?? null, passage_count: list(doc.passages).length,
      mention_count: views[document_index].annotations.length, relation_count: views[document_index].relations.length })),
    coverage: { requested_pmids: requested, returned_pmids: returned, missing_requested_pmids: requested.filter(pmid => !returned.includes(pmid)),
      documents_without_pmid: docs.length - returned.length, full_text_requested: request.full === true,
      scope: "Match native pmid only; order can differ from request. Full-text requests may return abstracts. IDs, passage counts and PMC IDs do not prove complete full text." },
    native, mentions: views.flatMap(view => view.annotations), relations: views.flatMap(view => view.relations),
    caveat: "No relation inferred from co-occurrence. Participants join all exact same-document identity matches, not a verified evidence sentence. Nodes accompanying native role1/role2 identities remain uninterpreted; other node refs match unique document-scoped annotation IDs. Offset units are candidates, not verified conventions. Native payload and article licenses are authoritative." };
}
