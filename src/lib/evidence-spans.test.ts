import { describe, expect, it } from "vitest";
import { evidenceSpans } from "./evidence-spans";

it("preserves a literal leading BOM in the UTF-8 span candidate", () => {
  const spans = evidenceSpans({text:"\uFEFFX",locations:[{offset:0,length:4}]},{offset:0,text:"\uFEFFX"});
  expect(spans[0]).toMatchObject({status:"text_match",matching_units:["utf8"],offset_unit_verified:false});
  expect(spans[0].interpretations).toContainEqual({unit:"utf8",text:"\uFEFFX"});
});

describe("BioC evidence span interpretation", () => {
  it("subtracts the document-relative passage offset", () => {
    expect(evidenceSpans({ text: "TP53", locations: [{ offset: 102, length: 4 }] }, { offset: 100, text: "A TP53 gene" })[0])
      .toMatchObject({ status: "text_match", matching_units: ["utf8", "codepoint", "utf16"], offset_unit_verified: false });
  });
  it.each([[5, "utf8"], [2, "codepoint"], [3, "utf16"]])("checks Unicode convention candidates at offset %s", (offset, unit) => {
    expect(evidenceSpans({ text: "TP53", locations: [{ offset, length: 4 }] }, { offset: 0, text: "😀 TP53 xyz" })[0].matching_units).toEqual([unit]);
  });
  it("does not repair a wrong span by searching for the mention elsewhere", () => {
    expect(evidenceSpans({ text: "TP53", locations: [{ offset: 0, length: 4 }] }, { offset: 0, text: "gene TP53" })[0].status).toBe("text_mismatch");
  });
  it.each([{ offset: -1, length: 2 }, { offset: 0.5, length: 2 }, { offset: "0", length: 2 }, { offset: 0, length: -1 }, { offset: 900, length: 2 }])("rejects unusable locations %j", location => {
    expect(evidenceSpans({ text: "TP53", locations: [location] }, { offset: 0, text: "TP53" })[0].status).toBe("invalid_or_unavailable");
  });
  it("retains discontinuous locations without claiming mention validation", () => {
    const locations = [{ offset: 0, length: 2 }, { offset: 5, length: 2 }];
    const spans = evidenceSpans({ text: "AB CD", locations }, { offset: 0, text: "ABxxxCD" });
    expect(spans.map(s => s.native)).toEqual(locations);
    expect(spans.every(s => s.status === "discontinuous_unverified")).toBe(true);
  });
  it("handles absent passage text or locations", () => {
    expect(evidenceSpans({}, {})).toEqual([]);
    expect(evidenceSpans({ locations: [null] }, {})[0].status).toBe("invalid_or_unavailable");
  });
});
