import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { pubtatorCatalog } from "../spec/catalog";
import { createPubtatorApiFetch } from "../lib/api-adapter";
import { pubtatorResponse } from "../lib/tool-result";

interface CodeModeEnv {
	PUBTATOR_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
	server: McpServer,
	env: CodeModeEnv,
): void {
	const apiFetch = createPubtatorApiFetch();
	const registrar = { tool: (...args: unknown[]) => {
		const [name, ...rest] = args;
		const callback = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof pubtatorResponse>[0]>;
		// SAFETY: shared factories supply the SDK arguments; only the alias changes.
		const register = server.tool.bind(server) as (...values: unknown[]) => void;
		for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
			(args: unknown, extra: unknown) => pubtatorResponse(() => callback(args, extra), env, alias, extra, args));
	} };

	const searchTool = createSearchTool({
		prefix: "pubtator",
		catalog: pubtatorCatalog,
	});
	searchTool.register(registrar);

	const executeTool = createExecuteTool({
		prefix: "pubtator",
		// Verifiable provenance: pubtator_execute results carry a _meta.citation.
		source: { id: "pubtator", name: "PubTator (NCBI)", url: "https://www.ncbi.nlm.nih.gov/research/pubtator3" },
		catalog: pubtatorCatalog,
		apiFetch,
		preserveApiErrors: true,
		doNamespace: env.PUBTATOR_DATA_DO,
		loader: env.CODE_MODE_LOADER,
		maxInlineBytes: 30 * 1024,
		stagingThreshold: 30 * 1024,
		timeout: 60000,
	});
	executeTool.register(registrar);
}
