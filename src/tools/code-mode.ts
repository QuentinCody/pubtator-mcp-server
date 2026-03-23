import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { pubtatorCatalog } from "../spec/catalog";
import { createPubtatorApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	PUBTATOR_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
	server: McpServer,
	env: CodeModeEnv,
) {
	const apiFetch = createPubtatorApiFetch();

	const searchTool = createSearchTool({
		prefix: "pubtator",
		catalog: pubtatorCatalog,
	});
	searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

	const executeTool = createExecuteTool({
		prefix: "pubtator",
		catalog: pubtatorCatalog,
		apiFetch,
		doNamespace: env.PUBTATOR_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
