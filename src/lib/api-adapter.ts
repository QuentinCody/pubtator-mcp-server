import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { pubtatorFetch } from "./http";

export function createPubtatorApiFetch(): ApiFetchFn {
	return async (request) => {
		const path = request.path;

		const response = await pubtatorFetch(path, request.params);

		if (!response.ok) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = response.statusText;
			}

			// Search endpoint can return HTML error pages on 500s
			if (errorBody.includes("<!DOCTYPE") || errorBody.includes("<html")) {
				const error = new Error(`HTTP ${response.status}: Server returned an HTML error page`) as Error & {
					status: number;
					data: unknown;
				};
				error.status = response.status;
				error.data = "Server error — the search endpoint may be temporarily unavailable";
				throw error;
			}

			const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
				status: number;
				data: unknown;
			};
			error.status = response.status;
			error.data = errorBody;
			throw error;
		}

		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("json")) {
			const text = await response.text();
			return { status: response.status, data: text };
		}

		const data = await response.json();

		// The /publications/export/biocjson endpoint wraps results in {"PubTator3": [...]}
		// Unwrap to return the array directly for cleaner staging and processing
		if (
			data &&
			typeof data === "object" &&
			!Array.isArray(data) &&
			"PubTator3" in data &&
			Array.isArray((data as Record<string, unknown>).PubTator3)
		) {
			return { status: response.status, data: (data as Record<string, unknown>).PubTator3 };
		}

		return { status: response.status, data };
	};
}
