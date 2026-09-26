import { getLanguageService, type LanguageService } from "vscode-json-languageservice/lib/esm/jsonLanguageService.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity, Range, type CompletionList, type Diagnostic, type Hover, type Position, type TextEdit } from "vscode-languageserver-types";
import { isMap, isNode, isScalar, isSeq, parseDocument, type Node as YamlNode } from "yaml";
import {
    completeComposeDocument,
    createComposeLanguageService,
    formatComposeDocument,
    hoverComposeDocument,
    validateComposeDocument,
} from "./yaml-service";
import { DisposedClientError, StaleResponseError } from "./yaml-client";

export interface LoadedSchema {
    uri: string;
    content: string;
}

export interface SchemaClientOptions {
    documentUri: string;
    language: "yaml" | "json";
    compose?: boolean;
    loadSchema: (uri: string) => Promise<LoadedSchema>;
    resolveReference?: (reference: string, documentUri: string) => string;
}

/** A tolerant top-level declaration lookup, including partially edited JSON. */
export function documentSchemaReference(text: string, language: "yaml" | "json"): string | undefined {
    if (language === "yaml") {
        const value = parseDocument(text).get("$schema");
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        const directive = /^[ \t]*#[ \t]*yaml-language-server:[ \t]*\$schema[ \t]*=[ \t]*(\S+)[ \t]*$/m.exec(text);
        return directive?.[1];
    }
    try {
        const value = JSON.parse(text)?.$schema;
        return typeof value === "string" ? value.trim() : undefined;
    } catch {
        const match = /^\s*\{\s*"\$schema"\s*:\s*("(?:\\.|[^"\\])*")/s.exec(text);
        if (match) {
            try {
                return JSON.parse(match[1]).trim();
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}

function schemaPropertyPath(text: string, language: "yaml" | "json", position: Position): string[] | undefined {
    if (language !== "yaml") {
        return undefined;
    }
    const doc = parseDocument(text);
    const offset = text.split("\n").slice(0, position.line).reduce((length, line) => length + line.length + 1, 0) + position.character;
    const visit = (node: YamlNode | null | undefined, parents: string[]): string[] | undefined => {
        if (isMap(node)) {
            for (const pair of node.items) {
                const key = pair.key;
                if (!isScalar(key) || typeof key.value !== "string" || !key.range) {
                    continue;
                }
                if (offset >= key.range[0] && offset < key.range[1]) {
                    return [ ...parents, key.value ];
                }
                const nested = visit(isNode(pair.value) ? pair.value : null, [ ...parents, key.value ]);
                if (nested) {
                    return nested;
                }
            }
        } else if (isSeq(node)) {
            for (const item of node.items) {
                const nested = visit(isNode(item) ? item : null, parents);
                if (nested) {
                    return nested;
                }
            }
        }
        return undefined;
    };
    return visit(doc.contents, []);
}

function schemaDefault(schema: Record<string, unknown>, path: string[]): unknown {
    const asObject = (value: unknown): Record<string, unknown> | undefined =>
        value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
    const search = (value: unknown, keys: string[], visited: Set<object>): unknown => {
        const node = asObject(value);
        if (!node || visited.has(node)) {
            return undefined;
        }
        visited.add(node);
        if (!keys.length && Object.hasOwn(node, "default")) {
            return node.default;
        }
        const ref = node.$ref;
        if (typeof ref === "string" && ref.startsWith("#/")) {
            const target = ref.slice(2).split("/").reduce<unknown>((value, segment) =>
                asObject(value)?.[segment.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
            const result = search(target, keys, visited);
            if (result !== undefined) {
                return result;
            }
        }
        if (keys.length) {
            const result = search(asObject(node.properties)?.[keys[0]], keys.slice(1), visited);
            if (result !== undefined) {
                return result;
            }
        }
        for (const group of [ node.allOf, node.anyOf, node.oneOf ]) {
            if (Array.isArray(group)) {
                for (const branch of group) {
                    const result = search(branch, keys, visited);
                    if (result !== undefined) {
                        return result;
                    }
                }
            }
        }
        return undefined;
    };
    return search(schema, path, new Set());
}

/** One client per editor: schema, document version and cache never leak between endpoints. */
export class SchemaLanguageClient {
    private service: ReturnType<typeof createComposeLanguageService> | LanguageService | null = null;
    private reference: string | undefined;
    private resolvedReference: string | undefined;
    private activeSchema: Record<string, unknown> | undefined;
    private latestVersion = 0;
    private disposed = false;
    private readonly schemaRequest = (uri: string) => this.options.loadSchema(uri.startsWith("file:") || uri.startsWith("https:")
        ? uri : this.options.resolveReference?.(uri, this.resolvedReference ?? this.options.documentUri) ?? uri).then(schema => {
        const parsed = parseDocument(schema.content, { strict: true });
        if (parsed.errors.length) {
            throw new Error(parsed.errors[0].message);
        }
        return JSON.stringify(parsed.toJS());
    });

    private schemaError: string | undefined;

    constructor(private readonly options: SchemaClientOptions) {}

    private async prepare(text: string, version: number): Promise<TextDocument> {
        if (this.disposed) {
            throw new DisposedClientError();
        }
        if (version < this.latestVersion) {
            throw new StaleResponseError(version, this.latestVersion);
        }
        this.latestVersion = version;
        const reference = documentSchemaReference(text, this.options.language) || undefined;
        if (reference !== this.reference || !this.service) {
            this.reference = reference;
            this.service = null;
            let schema: LoadedSchema | undefined;
            this.schemaError = undefined;
            this.resolvedReference = undefined;
            this.activeSchema = undefined;
            if (reference) {
                try {
                    schema = await this.options.loadSchema(reference);
                    this.resolvedReference = schema.uri;
                } catch (error) {
                    this.schemaError = error instanceof Error ? error.message : String(error);
                }
            }
            if (this.disposed) {
                throw new DisposedClientError();
            }
            if (version !== this.latestVersion) {
                throw new StaleResponseError(version, this.latestVersion);
            }
            let association: { uri: string; documentUri: string; content: Record<string, unknown> } | undefined;
            if (schema) {
                try {
                    const parsedSchema = parseDocument(schema.content, { strict: true });
                    if (parsedSchema.errors.length) {
                        throw new Error(parsedSchema.errors[0].message);
                    }
                    const content: unknown = parsedSchema.toJS();
                    if (!content || typeof content !== "object" || Array.isArray(content)) {
                        throw new Error("Schema must be an object");
                    }
                    const parsed = content as Record<string, unknown>;
                    this.activeSchema = parsed;
                    const properties = { ...(parsed.properties as Record<string, unknown> | undefined), $schema: { type: "string" } };
                    const contentWithDirective = { ...parsed, properties };
                    association = { uri: schema.uri, documentUri: this.options.documentUri, content: contentWithDirective };
                } catch (error) {
                    this.schemaError = error instanceof Error ? error.message : String(error);
                }
            }
            const resolve = (relative: string, resource: string): string => {
                const base = resource === this.options.documentUri && this.resolvedReference ? this.resolvedReference : resource;
                return this.options.resolveReference?.(relative, base) ?? String(new URL(relative, base));
            };
            if (this.options.language === "yaml") {
                this.service = createComposeLanguageService(this.schemaRequest, association, Boolean(this.options.compose && !reference), resolve);
            } else {
                const service = getLanguageService({
                    schemaRequestService: this.schemaRequest,
                    workspaceContext: { resolveRelativePath: resolve },
                });
                service.configure({
                    validate: true,
                    allowComments: false,
                    schemas: association ? [{ uri: association.uri, fileMatch: [ this.options.documentUri ], schema: association.content }] : [],
                });
                this.service = service;
            }
        }
        return TextDocument.create(this.options.documentUri, this.options.language, version, text);
    }

    private async request<T>(text: string, version: number, run: (document: TextDocument) => PromiseLike<T>): Promise<T> {
        const document = await this.prepare(text, version);
        const result = await run(document);
        if (this.disposed) {
            throw new DisposedClientError();
        }
        if (version !== this.latestVersion) {
            throw new StaleResponseError(version, this.latestVersion);
        }
        return result;
    }

    validate(text: string, version: number): Promise<Diagnostic[]> {
        return this.request(text, version, async document => {
            const diagnostics = await (this.options.language === "yaml"
                ? validateComposeDocument(this.service as ReturnType<typeof createComposeLanguageService>, document)
                : (this.service as LanguageService).doValidation(document, (this.service as LanguageService).parseJSONDocument(document)));
            if (this.schemaError) {
                const lines = text.split("\n");
                const line = Math.max(0, lines.findIndex(value => value.includes("$schema") && value.includes(this.reference ?? "")));
                const directive = lines[line].indexOf("$schema");
                // YAML LS reports the same failed schema request at the first YAML
                // node. Keep our diagnostic on the declaration instead.
                if (this.options.language === "yaml") {
                    for (let index = diagnostics.length - 1; index >= 0; index--) {
                        const diagnostic = diagnostics[index];
                        if (diagnostic.source === "YAML" && typeof diagnostic.message === "string" && /^Unable to load schema from /.test(diagnostic.message)) {
                            diagnostics.splice(index, 1);
                        }
                    }
                }
                diagnostics.push({
                    range: Range.create(line, Math.max(0, directive), line, Math.max(0, directive) + (directive >= 0 ? "$schema".length : Math.min(lines[line].length, 1))),
                    message: `Cannot load $schema: ${this.schemaError}`,
                    severity: DiagnosticSeverity.Error,
                    source: "schema",
                });
            }
            return diagnostics;
        });
    }

    complete(text: string, version: number, position: Position): Promise<CompletionList | null> {
        return this.request(text, version, async document => {
            const result = this.options.language === "yaml"
                ? (this.options.compose
                    ? await completeComposeDocument(this.service as ReturnType<typeof createComposeLanguageService>, document, position)
                    : await (this.service as ReturnType<typeof createComposeLanguageService>).doComplete(document, position, false))
                : await (this.service as LanguageService).doComplete(document, position, (this.service as LanguageService).parseJSONDocument(document));
            return result && {
                ...result,
                items: result.items.filter(item => ![ "$schema", "!override", "!reset" ].includes(item.label)),
            };
        });
    }

    hover(text: string, version: number, position: Position): Promise<Hover | null> {
        return this.request(text, version, async document => {
            const hover = this.options.language === "yaml"
                ? await hoverComposeDocument(this.service as ReturnType<typeof createComposeLanguageService>, document, position)
                : await (this.service as LanguageService).doHover(document, position, (this.service as LanguageService).parseJSONDocument(document));
            const property = schemaPropertyPath(text, this.options.language, position);
            const defaultValue = this.activeSchema && property && schemaDefault(this.activeSchema, property);
            if (hover && defaultValue !== undefined) {
                const contents = hover.contents;
                const value = `Default value: ${JSON.stringify(defaultValue)}`;
                return { ...hover, contents: typeof contents === "string"
                    ? `${contents}\n\n${value}` : !Array.isArray(contents) && "value" in contents
                        ? { ...contents, value: `${contents.value}\n\n${value}` } : contents };
            }
            return hover;
        });
    }

    format(text: string, version: number): Promise<TextEdit[]> {
        return this.request(text, version, async document => this.options.language === "yaml"
            ? formatComposeDocument(this.service as ReturnType<typeof createComposeLanguageService>, document, Boolean(this.options.compose))
            : (this.service as LanguageService).format(document, undefined, {
                tabSize: 2,
                insertSpaces: true,
                insertFinalNewline: true,
            }));
    }

    dispose(): void {
        this.disposed = true;
        this.service = null;
    }
}
