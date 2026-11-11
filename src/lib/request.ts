const PATHS = new Set(["/publications/export/biocjson", "/publications/evidence", "/search/", "/entity/autocomplete/", "/relations"]);
const invalid = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };

export function requestParts(path: string, supplied: Record<string, unknown> = {}) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("#") || path.includes("\\")) invalid("Expected a relative PubTator API path");
  const url = new URL(path, "https://pubtator.invalid");
  if (!PATHS.has(url.pathname)) invalid("Unsupported PubTator API path");
  const params = { ...supplied };
  for (const [key, value] of url.searchParams) {
    if (Object.prototype.hasOwnProperty.call(params, key)) invalid(`Duplicate query parameter: ${key}`);
    params[key] = value;
  }
  if (url.pathname.startsWith("/publications/")) {
    if (Object.keys(params).some(key => key !== "pmids" && key !== "full")) invalid("Publication export accepts pmids and full only");
    if (typeof params.pmids !== "string" || !/^[1-9]\d*(,[1-9]\d*)*$/.test(params.pmids)) invalid("pmids must be comma-separated numeric PubMed IDs");
    if ((params.pmids as string).split(",").length > 100) invalid("Request at most 100 PMIDs");
    // Upstream treats even full=false as a full-text request: omission is required for abstracts.
    if (params.full === false || params.full === "false" || params.full === undefined) delete params.full;
    else if (params.full === true || params.full === "true") params.full = true;
    else invalid("full must be true or false");
  }
  if (url.pathname === "/search/") {
    if (params.size !== undefined || params.page_size !== undefined) invalid("PubTator ignores size/page_size; use page and inspect native page_size");
    if (params.page !== undefined && (!/^[1-9]\d*$/.test(String(params.page)) || !Number.isSafeInteger(Number(params.page)))) invalid("page must be a positive integer (first page is 1)");
  }
  if (url.pathname === "/entity/autocomplete/" && params.type !== undefined) {
    if (typeof params.type !== "string") invalid("Autocomplete type must be a string");
    const concept = String(params.type).toLowerCase();
    if (params.concept !== undefined && params.concept !== concept) invalid("Conflicting autocomplete type and concept");
    params.concept = concept; delete params.type;
  }
  return { path: url.pathname, params };
}
