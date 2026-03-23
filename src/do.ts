import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class PubtatorDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;

		// Array responses
		if (Array.isArray(data)) {
			const sample = data[0];
			if (sample && typeof sample === "object") {
				// BioC JSON articles — have passages with annotations
				if ("_id" in sample && "passages" in sample) {
					return {
						tableName: "articles",
						indexes: ["_id", "pmid"],
					};
				}

				// Search results — have pmid, title, score
				if ("pmid" in sample && "title" in sample) {
					return {
						tableName: "search_results",
						indexes: ["pmid", "journal", "date"],
					};
				}

				// Autocomplete results — have biotype, db_id, name
				if ("biotype" in sample && "db_id" in sample) {
					return {
						tableName: "autocomplete_results",
						indexes: ["biotype", "db_id", "name"],
					};
				}

				// Annotation entries (flattened from passages)
				if ("type" in sample && "text" in sample && "infons" in sample) {
					return {
						tableName: "annotations",
						indexes: ["type", "text"],
					};
				}
			}
		}

		// Single BioC JSON article object
		const obj = data as Record<string, unknown>;
		if (obj._id && obj.passages) {
			return {
				tableName: "article",
				indexes: ["_id", "pmid"],
			};
		}

		return undefined;
	}
}
