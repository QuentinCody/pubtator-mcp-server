type Row = Record<string, unknown>;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function slice(text: string, start: number, length: number, unit: string): string | null {
  if (unit === "utf8") {
    const bytes = encoder.encode(text);
    if (start + length > bytes.length) return null;
    try { return decoder.decode(bytes.slice(start, start + length)); } catch { return null; }
  }
  const chars = unit === "codepoint" ? Array.from(text) : text.split("");
  return start + length <= chars.length ? chars.slice(start, start + length).join("") : null;
}

function candidates(location: Row, container: Row) {
  const offset = location.offset; const length = location.length; const base = container.offset;
  if (![offset, length, base].every(v => Number.isSafeInteger(v) && Number(v) >= 0) || typeof container.text !== "string") return [];
  const start = Number(offset) - Number(base);
  if (start < 0 || !Number.isSafeInteger(start + Number(length))) return [];
  return ["utf8", "codepoint", "utf16"].flatMap(unit => {
    const text = slice(container.text as string, start, Number(length), unit);
    return text === null ? [] : [{ unit, text }];
  });
}

/** Candidate interpretations only: matching text does not establish the provider's offset convention. */
export function evidenceSpans(annotation: Row, container: Row) {
  if (!Array.isArray(annotation.locations)) return [];
  const single = annotation.locations.length === 1;
  return annotation.locations.map((native: unknown) => {
    const location = native && typeof native === "object" ? native as Row : {};
    const interpretations = candidates(location, container);
    const matches = single && typeof annotation.text === "string"
      ? interpretations.filter(value => value.text === annotation.text) : [];
    const status = !interpretations.length ? "invalid_or_unavailable" : !single ? "discontinuous_unverified" : matches.length ? "text_match" : "text_mismatch";
    return { native, status, interpretations, matching_units: matches.map(value => value.unit), offset_unit_verified: false };
  });
}
