import { describe, expect, it } from "vitest";
import { buildEvidence } from "./evidence";
const annotation = { id: "a1", text: "TP53", infons: { type: "Gene", identifier: "7157;22059" }, locations: [{ offset: 0, length: 4 }] };
const document = { id: "123", _id: "123|PMC456", passages: [{ offset: 0, text: "TP53", annotations: [annotation] }], relations: [{ id: "r1", infons: { type: "associate" }, nodes: [{ refid: "a1", role: "subject" }] }] };

describe("PubTator lossless evidence view", () => {
  it.each([document, [document], { PubTator3: [document], source_version: "fixture" }, { documents: [document] }])("accepts BioC export envelope %#", native => {
    const result = buildEvidence(native, { pmids: "123" });
    expect(result.native).toBe(native);
    expect(result.mentions).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({ evidence_kind: "text_mined", curated_assertion: false, nodes: [{ resolution: "resolved_annotation", annotation_paths: ["/passages/0/annotations/0"] }] });
  });
  it("keeps compound IDs intact and never manufactures a PMID from a record ID", () => {
    const result = buildEvidence(document, {});
    expect(result.mentions[0]).toMatchObject({ identifier: "7157;22059", document_id: "123", record_id: "123|PMC456", exact_source_key: '["PubTator3","Gene",null,"7157;22059"]' });
    expect(result.mentions[0]).not.toHaveProperty("pmid");
  });
  it("does not join IDs across documents or choose among duplicate annotation IDs", () => {
    const native = [document, { ...document, passages: [] }, { ...document, passages: [{ ...document.passages[0], annotations: [annotation, annotation] }] }];
    expect(buildEvidence(native, {}).relations.map(r => r.nodes[0].resolution)).toEqual(["resolved_annotation", "unresolved", "ambiguous"]);
  });
  it("includes sentence annotations and relations without inferring co-occurrence edges", () => {
    const native = { passages: [{ sentences: [{ offset: 0, text: "TP53", annotations: [annotation], relations: [] }] }] };
    const result = buildEvidence(native, {});
    expect(result.mentions[0].path).toBe("/passages/0/sentences/0/annotations/0");
    expect(result.relations).toEqual([]);
  });
  it("does not create keys for unavailable identifiers", () => {
    const native = { passages: [{ annotations: [{ infons: { type: "Gene", identifier: "-" } }, {}] }] };
    expect(buildEvidence(native, {}).mentions.map(m => m.exact_source_key)).toEqual([null, null]);
  });
  it("rejects unknown envelopes instead of claiming zero annotations", () => {
    expect(() => buildEvidence({ message: "unavailable" }, {})).toThrow("Unrecognized BioC");
    expect(buildEvidence({ PubTator3: [] }, {}).mentions).toEqual([]);
  });
});
