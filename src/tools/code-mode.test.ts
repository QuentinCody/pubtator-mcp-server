import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { createPubtatorApiFetch } from "../lib/api-adapter";
import { pubtatorCatalog } from "../spec/catalog";
afterEach(() => vi.unstubAllGlobals());

it("registers eight aliases and returns both fields on success and errors", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  // SAFETY: invalid execution does not invoke the fixture loader.
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  // SAFETY: inspect the SDK registry to exercise actual registered callbacks.
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  expect(Object.keys(tools)).toHaveLength(8);
  for (const prefix of ["", "mcp_"]) {
    expect(await tools[prefix + "pubtator_search"].handler({ query: "evidence", max_results: 2 }, {})).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    for (const [name, args] of [["pubtator_execute", { code: "" }], ["pubtator_query_data", { data_access_id: "fixture", sql: "SELECT 1" }], ["pubtator_get_schema", { data_access_id: "fixture" }]] as const) {
      expect(await tools[prefix + name].handler(args, {})).toMatchObject({ content: expect.any(Array), structuredContent: expect.any(Object), isError: true });
    }
  }
});

it("stages native BioC collection metadata and evidence with multibyte passages", async () => {
  const native = { PubTator3: [{ id: "123", passages: [{ offset: 0, text: "α".repeat(20000), annotations: [] }] }], date: "fixture-date" };
  vi.stubGlobal("fetch", async () => Response.json(native));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      // SAFETY: shared staging sends a data envelope to the process route.
      const payload = await request.json() as { data: unknown }; stored.push(payload.data);
      return Response.json({ success: true, tables_created: ["articles"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: { articles: { columns: [{ name: "id" }] } } } });
  } }) };
  const proxy = createApiProxyTool({ apiFetch: createPubtatorApiFetch(), catalog: pubtatorCatalog, doNamespace: namespace, stagingPrefix: "pubtator", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/publications/evidence", params: { pmids: "123" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String), _staging: expect.any(Object) });
  expect(stored.map(value => typeof value === "string" ? JSON.parse(value) : value)).toEqual(expect.arrayContaining([expect.objectContaining({ native, evidence_kind: "text_mined", curated_assertion: false })]));
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
