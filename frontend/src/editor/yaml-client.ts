import { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionList, Diagnostic, Hover, Position, TextEdit } from "vscode-languageserver-types";
import {
    completeComposeDocument,
    createComposeLanguageService,
    formatComposeDocument,
    hoverComposeDocument,
    validateComposeDocument,
} from "./yaml-service";
import { COMPOSE_DOCUMENT_URI } from "./yaml-protocol";

/** Language service owned by one editor, independent of browser Worker scheduling. */
export class YamlLanguageClient {
    private service: ReturnType<typeof createComposeLanguageService> | null = null;
    private latestVersion = 0;
    private disposed = false;

    constructor(private readonly documentUri = COMPOSE_DOCUMENT_URI) {}

    private async request<T>(
        text: string,
        version: number,
        run: (document: TextDocument) => Promise<T>
    ): Promise<T> {
        if (this.disposed) {
            throw new DisposedClientError();
        }
        if (version < this.latestVersion) {
            throw new StaleResponseError(version, this.latestVersion);
        }
        this.latestVersion = version;
        const document = TextDocument.create(this.documentUri, "yaml", version, text);
        const result = await run(document);
        if (this.disposed) {
            throw new DisposedClientError();
        }
        if (version !== this.latestVersion) {
            throw new StaleResponseError(version, this.latestVersion);
        }
        return result;
    }

    private get languageService() {
        return this.service ??= createComposeLanguageService();
    }

    validate(text: string, version: number): Promise<Diagnostic[]> {
        return this.request(text, version, (document) => validateComposeDocument(this.languageService, document));
    }

    complete(text: string, version: number, position: Position): Promise<CompletionList | null> {
        return this.request(text, version, (document) => completeComposeDocument(this.languageService, document, position));
    }

    hover(text: string, version: number, position: Position): Promise<Hover | null> {
        return this.request(text, version, (document) => hoverComposeDocument(this.languageService, document, position));
    }

    format(text: string, version: number): Promise<TextEdit[]> {
        return this.request(text, version, (document) => formatComposeDocument(this.languageService, document));
    }

    dispose(): void {
        this.disposed = true;
        this.service = null;
    }
}

export class DisposedClientError extends Error {
    constructor() {
        super("YAML language client disposed");
        this.name = "DisposedClientError";
    }
}

export class StaleResponseError extends Error {
    constructor(
        readonly responseVersion: number,
        readonly expectedVersion: number
    ) {
        super(`Stale YAML language response (got ${responseVersion}, expected ${expectedVersion})`);
        this.name = "StaleResponseError";
    }
}
