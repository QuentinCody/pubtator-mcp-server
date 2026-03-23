import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const PUBTATOR_BASE = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api";

export interface PubtatorFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
}

/**
 * Fetch from the PubTator3 API.
 */
export async function pubtatorFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: PubtatorFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? PUBTATOR_BASE;
	const headers: Record<string, string> = {
		Accept: "application/json",
		...(opts?.headers ?? {}),
	};

	return restFetch(baseUrl, path, params, {
		...opts,
		headers,
		retryOn: [429, 500, 502, 503],
		retries: opts?.retries ?? 3,
		timeout: opts?.timeout ?? 30_000,
		userAgent: "pubtator-mcp-server/1.0 (bio-mcp)",
	});
}
