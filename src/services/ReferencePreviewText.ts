const UUID_PATTERN = '[A-Za-z0-9_-]{36,}';
const DEFAULT_MAX_DEPTH = 8;

export interface ReferencePreviewTextResolver {
	resolveSummary(uuid: string): string | null;
}

export interface ReferencePreviewTextOptions {
	maxDepth?: number;
}

export function resolveReferencePreviewText(
	text: string,
	resolver: ReferencePreviewTextResolver,
	options: ReferencePreviewTextOptions = {},
): string {
	return resolveText(text, resolver, new Set<string>(), 0, options.maxDepth ?? DEFAULT_MAX_DEPTH);
}

function resolveText(
	text: string,
	resolver: ReferencePreviewTextResolver,
	visited: ReadonlySet<string>,
	depth: number,
	maxDepth: number,
): string {
	return text.replace(
		createUuidSyntaxRegex(),
		(_match, embedUuid: string | undefined, inlineUuid: string | undefined, fullwidthUuid: string | undefined) => {
			const uuid = embedUuid ?? inlineUuid ?? fullwidthUuid;
			if (!uuid) {
				return _match;
			}

			if (visited.has(uuid)) {
				return '[Cyclic block]';
			}

			if (depth >= maxDepth) {
				return '[Reference depth limit]';
			}

			const summary = resolver.resolveSummary(uuid);
			if (!summary) {
				return '[Missing block]';
			}

			const nextVisited = new Set(visited);
			nextVisited.add(uuid);
			return resolveText(summary, resolver, nextVisited, depth + 1, maxDepth);
		},
	);
}

function createUuidSyntaxRegex(): RegExp {
	return new RegExp(
		`\\{\\{embed\\s+\\(\\((${UUID_PATTERN})\\)\\)\\s*\\}\\}|\\(\\((${UUID_PATTERN})\\)\\)|（（(${UUID_PATTERN})））`,
		'g',
	);
}
