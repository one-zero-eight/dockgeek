import type { LoadedSchema } from "./schema-client";

export interface SchemaOrigin {
    source: "project" | "files";
    projectName?: string;
    filename?: string;
    path?: string;
}

export type EmitSchemaRequest = (
    event: string,
    request: SchemaOrigin & { schemaUrl: string; baseUri?: string },
    callback: (result: { ok: boolean; content?: string; uri?: string; msg?: string }) => void
) => void;

/** The backend resolves the first reference against the edited document's real path. */
export function schemaLoader(emit: EmitSchemaRequest, origin: SchemaOrigin): (uri: string) => Promise<LoadedSchema> {
    return uri => new Promise((resolve, reject) => {
        emit("readEditorSchema", { ...origin, schemaUrl: uri }, result => {
            if (result.ok && typeof result.content === "string" && typeof result.uri === "string") {
                resolve({ content: result.content, uri: result.uri });
            } else {
                reject(new Error(result.msg || "Schema could not be loaded"));
            }
        });
    });
}

/** Relative references inside schemas use the schema's URI, not the edited document's URI. */
export function resolveSchemaReference(reference: string, resource: string): string {
    if (/^https:\/\//i.test(reference) || (reference.startsWith("/") && !resource.startsWith("https:"))) {
        return reference;
    }
    if (/^file:\/\//i.test(reference) || /^[a-z][a-z\d+.-]*:/i.test(reference)) {
        return reference;
    }
    return String(new URL(reference, resource));
}
