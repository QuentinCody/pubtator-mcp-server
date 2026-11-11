import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { readPubtatorWithReceipt } from "./read";
import { buildEvidence, row } from "./evidence";
import { requestParts } from "./request";
import { pubtatorCompleteness } from "./completeness";

export function createPubtatorApiFetch(): ApiFetchFn {
  return async request => {
    if (request.method !== "GET" || request.body !== undefined) throw Object.assign(new Error("PubTator catalog supports GET requests only"), { status: 400 });
    const { path, params } = requestParts(request.path, request.params);
    const { native, receipt } = await readPubtatorWithReceipt(path === "/publications/evidence" ? "/publications/export/biocjson" : path, params);
    if (path === "/publications/evidence") {
      try {
        const data = { ...buildEvidence(native, params), receipt };
        return { status: 200, data, completeness: pubtatorCompleteness(data) };
      } catch (error) {
        throw Object.assign(new Error(error instanceof Error ? error.message : "Invalid BioC evidence"), { status: 502, data: { native, receipt } });
      }
    }
    // Keep the established legacy array response. The evidence route retains the complete envelope.
    const articles = row(native).PubTator3;
    const data = Array.isArray(articles) ? articles : native;
    return { status: 200, data, completeness: pubtatorCompleteness(data) };
  };
}
