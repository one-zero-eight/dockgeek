import test from "node:test";
import assert from "node:assert/strict";
import { SchemaLanguageClient, documentSchemaReference } from "./schema-client";
import { schemaLoader } from "./schema-transport";
import { TextDocument } from "vscode-languageserver-textdocument";

test("project schema transport sends the renamed origin and schema request", async () => {
    const requests: unknown[] = [];
    const load = schemaLoader((event, request, callback) => {
        assert.equal(event, "readEditorSchema");
        requests.push(request);
        callback({ ok: true, uri: "file:///projects/demo/config.schema.yaml", content: "type: object" });
    }, { source: "project", projectName: "demo", filename: "config.yaml" });
    assert.deepEqual(await load("./config.schema.yaml"), {
        uri: "file:///projects/demo/config.schema.yaml", content: "type: object",
    });
    assert.deepEqual(requests, [{
        source: "project", projectName: "demo", filename: "config.yaml", schemaUrl: "./config.schema.yaml",
    }]);
});

const schema = JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: { name: { type: "string", description: "Display name" } },
});

for (const language of [ "yaml", "json" ] as const) {
    test(`${language} explicit schema supplies completion and validation`, async () => {
        const requested: string[] = [];
        const client = new SchemaLanguageClient({
            language,
            documentUri: `file:///settings.${language}`,
            loadSchema: async uri => {
                requested.push(uri);
                return { uri: "file:///schema.json", content: schema };
            },
        });
        const text = language === "yaml" ? "$schema: \"./schema.json\"\nname: 1\n" : "{\"$schema\":\"./schema.json\",\"name\":1}";
        const diagnostics = await client.validate(text, 1);
        assert.deepEqual(requested, [ "./schema.json" ]);
        assert.ok(diagnostics.some(item => /string/.test(item.message)), JSON.stringify(diagnostics));
        const completionText = language === "yaml" ? "$schema: \"./schema.json\"\n" : "{\"$schema\":\"./schema.json\",";
        const completion = await client.complete(completionText, 2, language === "yaml" ? { line: 1, character: 0 } : { line: 0, character: completionText.length });
        assert.ok(completion?.items.some(item => item.label.includes("name")), JSON.stringify(completion));
        assert.ok(completion?.items.every(item => ![ "$schema", "!override", "!reset" ].includes(item.label)), JSON.stringify(completion));
        client.dispose();
    });
}

test("format YAML and JSON files without Compose-specific service spacing", async () => {
    const yamlClient = new SchemaLanguageClient({
        language: "yaml", documentUri: "file:///settings.yaml", loadSchema: async () => ({ uri: "file:///schema.json", content: schema }),
    });
    const yamlText = "services:\n first: { image: alpine }\n second: { image: nginx }\n";
    const yamlEdits = await yamlClient.format(yamlText, 1);
    assert.ok(yamlEdits.length > 0);
    const formattedYaml = yamlEdits[0].newText;
    assert.match(formattedYaml, /\n {2}second:/);
    assert.doesNotMatch(formattedYaml, /first:.*\n\n {2}second:/);
    yamlClient.dispose();

    const jsonClient = new SchemaLanguageClient({
        language: "json", documentUri: "file:///settings.json", loadSchema: async () => ({ uri: "file:///schema.json", content: schema }),
    });
    const jsonText = "{\"name\":\"app\"}";
    const jsonEdits = await jsonClient.format(jsonText, 1);
    const formattedJson = TextDocument.applyEdits(TextDocument.create("file:///settings.json", "json", 1, jsonText), jsonEdits);
    assert.equal(JSON.parse(formattedJson).name, "app");
    assert.match(formattedJson, /\n {2}"name": "app"/);
    jsonClient.dispose();
});

test("explicit schema replaces bundled Compose schema and keeps its $schema key valid", async () => {
    const client = new SchemaLanguageClient({
        language: "yaml", compose: true, documentUri: "file:///compose.yaml",
        loadSchema: async () => ({ uri: "file:///custom.json", content: schema }),
    });
    const diagnostics = await client.validate("$schema: \"./custom.json\"\nname: okay\n", 1);
    assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics));
    client.dispose();
});

test("YAML schemas and relative refs resolve through the schema request service", async () => {
    const requested: string[] = [];
    const client = new SchemaLanguageClient({
        language: "yaml", documentUri: "file:///projects/test/config.yaml",
        loadSchema: async uri => {
            requested.push(uri);
            return uri === "./main.yaml"
                ? { uri: "file:///projects/test/main.yaml", content: "type: object\nproperties:\n  name:\n    $ref: ./name.yaml\n" }
                : { uri: "file:///projects/test/name.yaml", content: "type: string\n" };
        },
    });
    const diagnostics = await client.validate("$schema: \"./main.yaml\"\nname: 4\n", 1);
    assert.ok(diagnostics.some(item => /string/.test(item.message)), JSON.stringify(diagnostics));
    assert.ok(requested.some(uri => uri.endsWith("/projects/test/name.yaml")), JSON.stringify(requested));
    client.dispose();
});

test("YAML schema comments select a schema without overriding an explicit $schema key", () => {
    assert.equal(documentSchemaReference("# yaml-language-server: $schema=https://example.org/schema.json\nname: test\n", "yaml"), "https://example.org/schema.json");
    assert.equal(documentSchemaReference("  # yaml-language-server: $schema=./schema.yaml\nname: test\n", "yaml"), "./schema.yaml");
    assert.equal(documentSchemaReference("# yaml-language-server: $schema=./comment.yaml\n$schema: ./field.yaml\n", "yaml"), "./field.yaml");
    assert.equal(documentSchemaReference("# unrelated $schema=./wrong.yaml\nname: test\n", "yaml"), undefined);
});

test("YAML schema comment supplies completion and validation", async () => {
    const requested: string[] = [];
    const client = new SchemaLanguageClient({
        language: "yaml", documentUri: "file:///settings.yaml",
        loadSchema: async uri => {
            requested.push(uri);
            return { uri: "file:///schema.json", content: schema };
        },
    });
    const directive = "# yaml-language-server: $schema=./schema.json\n";
    const diagnostics = await client.validate(`${directive}name: 1\n`, 1);
    assert.deepEqual(requested, [ "./schema.json" ]);
    assert.ok(diagnostics.some(item => /string/.test(item.message)), JSON.stringify(diagnostics));
    const completion = await client.complete(directive, 2, { line: 1, character: 0 });
    assert.ok(completion?.items.some(item => item.label.includes("name")), JSON.stringify(completion));
    assert.ok(completion?.items.every(item => ![ "$schema", "!override", "!reset" ].includes(item.label)), JSON.stringify(completion));
    client.dispose();
});

test("Compose keeps bundled schema unless comment specifies another schema", async () => {
    const requested: string[] = [];
    const client = new SchemaLanguageClient({
        language: "yaml", compose: true, documentUri: "file:///test-compose-comment/compose.yaml",
        loadSchema: async uri => {
            requested.push(uri);
            return { uri: "file:///custom.json", content: schema };
        },
    });
    const defaultDiagnostics = await client.validate("services:\n  app:\n    image: alpine\n", 1);
    assert.equal(defaultDiagnostics.length, 0, JSON.stringify(defaultDiagnostics));
    const invalidCompose = await client.validate("not_a_compose_key: true\n", 2);
    assert.ok(invalidCompose.some(item => /not_a_compose_key/.test(item.message)), JSON.stringify(invalidCompose));
    assert.deepEqual(requested, []);
    const directive = "# yaml-language-server: $schema=./custom.json\n";
    const customDiagnostics = await client.validate(`${directive}name: okay\n`, 3);
    assert.equal(customDiagnostics.length, 0, JSON.stringify(customDiagnostics));
    const overriddenDiagnostics = await client.validate(`${directive}services: {}\n`, 4);
    assert.ok(overriddenDiagnostics.some(item => /services/.test(item.message)), JSON.stringify(overriddenDiagnostics));
    assert.equal(requested[0], "./custom.json");
    const completion = await client.complete(directive, 5, { line: 1, character: 0 });
    assert.ok(completion?.items.some(item => item.label.includes("name")), JSON.stringify(completion));
    client.dispose();
});

test("YAML schema hover shows resolved field defaults only on keys", async () => {
    const client = new SchemaLanguageClient({
        language: "yaml", documentUri: "file:///prettier.yaml",
        loadSchema: async () => ({ uri: "file:///prettier.schema.json", content: JSON.stringify({
            oneOf: [{ allOf: [{ $ref: "#/definitions/options" }] }],
            definitions: { options: { properties: {
                printWidth: { type: "integer", description: "Line length", default: 80 },
                enabled: { type: "boolean", description: "Enabled", default: false },
                label: { type: "string", description: "Label" },
            } } },
        }) }),
    });
    const text = "# yaml-language-server: $schema=./prettier.schema.json\nprintWidth: 100\nenabled: true\nlabel: text\n";
    const width = await client.hover(text, 1, { line: 1, character: 3 });
    assert.match(JSON.stringify(width?.contents), /Default value: 80/);
    const enabled = await client.hover(text, 2, { line: 2, character: 2 });
    assert.match(JSON.stringify(enabled?.contents), /Default value: false/);
    const value = await client.hover(text, 3, { line: 1, character: 13 });
    assert.doesNotMatch(JSON.stringify(value?.contents), /Default value:/);
    const withoutDefault = await client.hover(text, 4, { line: 3, character: 2 });
    assert.doesNotMatch(JSON.stringify(withoutDefault?.contents), /Default value:/);
    client.dispose();
});

test("declaration extraction tolerates partial JSON", () => {
    assert.equal(documentSchemaReference("{\"$schema\":\"./schema.yaml\",\"name\":", "json"), "./schema.yaml");
});

test("failed YAML comment schema reports the error on the declaration", async () => {
    const client = new SchemaLanguageClient({
        language: "yaml", documentUri: "file:///projects/demo/remote-schema.yaml",
        loadSchema: async () => {
            throw new Error("No content");
        },
    });
    const text = "# yaml-language-server: $schema=https://raw.githubusercontent.com/example/schema.json\nprintWidth: 100\n";
    const diagnostics = await client.validate(text, 1);
    assert.ok(diagnostics.some(item => /schema|No content/i.test(item.message)), JSON.stringify(diagnostics));
    assert.ok(diagnostics.filter(item => /schema|No content/i.test(item.message)).every(item => item.range.start.line === 0), JSON.stringify(diagnostics));
    const laterDirective = await client.validate("# other $schema=./ignored.json\n$schema: ./missing.json\nprintWidth: 100\n", 2);
    assert.ok(laterDirective.filter(item => typeof item.message === "string" && item.message.startsWith("Cannot load $schema")).every(item => item.range.start.line === 1), JSON.stringify(laterDirective));
    client.dispose();
});

test("unavailable schema produces a visible diagnostic", async () => {
    const client = new SchemaLanguageClient({
        language: "json", documentUri: "file:///settings.json",
        loadSchema: async () => {
            throw new Error("Not allowed");
        },
    });
    assert.ok((await client.validate("{\"$schema\":\"https://example.com/schema.json\"}", 1)).some(item => item.message.includes("Not allowed")));
    client.dispose();
});
