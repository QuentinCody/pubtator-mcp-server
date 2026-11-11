import type { Completeness } from "@bio-mcp/shared";
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const scoped = (returned: number, detail: string): Completeness => ({ complete: false, returned,
  truncation: { reason: "unknown", detail, remedy: "Retain native paging, document IDs and request scope. Returned text-mined evidence does not establish exhaustive publication, entity or relation coverage." } });

function direct(value: unknown): Completeness | undefined {
  if (Array.isArray(value)) return scoped(value.length, "One PubTator selection or ranked list; coverage outside this response is unknown.");
  if (!record(value)) return undefined;
  if (value.source === "PubTator3" && Array.isArray(value.documents)) return scoped(value.documents.length, "Returned BioC documents only. Requested full text can fall back to abstracts; missing PMIDs are reported separately.");
  if (Array.isArray(value.PubTator3)) return scoped(value.PubTator3.length, "Returned BioC documents only, not all indexed publications or full-text availability.");
  if (Array.isArray(value.results)) {
    const total = typeof value.count === "number" && Number.isSafeInteger(value.count) && value.count >= value.results.length ? value.count : undefined;
    return { ...scoped(value.results.length, "One native search page; page_size and current describe the provider page."), ...(total === undefined ? {} : { total_available: total }) };
  }
  if (Array.isArray(value.passages)) return scoped(1, "One returned BioC document, not proof of full-text or annotation coverage.");
  return undefined;
}

export function pubtatorCompleteness(value: unknown): Completeness | undefined {
  const pending = [value]; const found: Completeness[] = [];
  while (pending.length) {
    const item = pending.pop(); if (!item || typeof item !== "object") continue;
    if (record(item) && (item.__staged === true || item.__api_error === true || item.__stage_error === true)) {
      if (record(item._staging) && record(item._staging.completeness) && item._staging.completeness.complete === false)
        found.push({ ...item._staging.completeness, complete: false });
      continue;
    }
    const scope = direct(item);
    if (scope) found.push(scope); else pending.push(...Object.values(item));
  }
  return found.length < 2 ? found[0] : { complete: false, truncation: { reason: "unknown", detail: "Composed PubTator observations have independent document, entity and paging scopes.", remedy: "Keep observations separate; do not sum unrelated counts or infer exhaustive coverage." } };
}
