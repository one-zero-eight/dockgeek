import test from "node:test";
import assert from "node:assert/strict";
import { TextDocument } from "vscode-languageserver-textdocument";
import { InsertTextFormat } from "vscode-languageserver-types";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { composeKeyAt, normalizeComposeDocumentation } from "./compose-language";
import {
    completeComposeDocument,
    createComposeLanguageService,
    formatComposeDocument,
    hoverComposeDocument,
    validateComposeDocument,
} from "./yaml-service";
import { COMPOSE_DOCUMENT_URI } from "./yaml-protocol";
import { DisposedClientError, StaleResponseError, YamlLanguageClient } from "./yaml-client";

const ls = createComposeLanguageService();
let nextVersion = 1;

function doc(text: string, uri = COMPOSE_DOCUMENT_URI) {
    return TextDocument.create(uri, "yaml", nextVersion++, text);
}

test("valid compose document has no schema errors", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    image: nginx:latest
`));
    assert.equal(diagnostics.length, 0);
});

test("unknown top-level property is diagnosed", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    image: nginx:latest
notAComposeKey: true
`));
    assert.ok(diagnostics.some((d) => /notAComposeKey|Property .+ is not allowed/i.test(d.message)));
});

test("wrong value type is diagnosed", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    image: 123
`));
    assert.ok(diagnostics.length > 0);
});

test("incomplete yaml during typing does not throw", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    image:
`));
    assert.ok(Array.isArray(diagnostics));
});

test("x- extension fields are allowed", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
x-dockge:
  url: http://localhost
services:
  web:
    image: nginx:latest
    x-custom: value
`));
    assert.equal(diagnostics.length, 0);
});

test("anchors and merges do not crash validation", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
x-common: &common
  restart: unless-stopped
services:
  web:
    <<: *common
    image: nginx:latest
`));
    assert.ok(Array.isArray(diagnostics));
});

test("interpolation expressions are accepted in string fields", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    image: nginx:\${TAG:-latest}
    environment:
      - HOST=\${HOST}
`));
    assert.equal(diagnostics.length, 0);
});

test("completion suggests compose keys", async () => {
    const text = `services:
  web:
    `;
    const result = await completeComposeDocument(ls, doc(text), {
        line: 2,
        character: 4,
    });
    assert.ok(result);
    const labels = result.items.map((item) => item.label);
    assert.ok(labels.includes("image"));
    assert.ok(!labels.some((label) => String(label).startsWith("!")));
});

test("completion omits yaml tags when editing a mapping key", async () => {
    const text = `services:
  web:
    image: busybox
    `;
    const result = await completeComposeDocument(ls, doc(text), {
        line: 3,
        character: 4,
    });
    assert.ok(result);
    const labels = result.items.map((item) => String(item.label));
    assert.ok(labels.includes("volumes"));
    assert.ok(!labels.includes("!override"));
    assert.ok(!labels.includes("!reset"));
});

test("completion ranks sibling keys and common priors first", async () => {
    const text = `services:
  api:
    image: nginx
    ports:
      - "80:80"
    volumes:
      - ./data:/data
  web:
    `;
    const result = await completeComposeDocument(ls, doc(text), {
        line: 8,
        character: 4,
    });
    assert.ok(result);
    const labels = result.items.map((item) => String(item.label));
    const top = labels.slice(0, 6);
    assert.ok(top.includes("image"), `top=${top.join(",")}`);
    assert.ok(top.includes("ports"), `top=${top.join(",")}`);
    assert.ok(top.includes("volumes"), `top=${top.join(",")}`);
    assert.ok(labels.indexOf("image") < labels.indexOf("blkio_config"));
});

test("completion keeps yaml tags after a mapping colon", async () => {
    const text = `services:
  web:
    image: `;
    const result = await completeComposeDocument(ls, doc(text), {
        line: 2,
        character: 11,
    });
    assert.ok(result);
    const labels = result.items.map((item) => String(item.label));
    assert.ok(labels.includes("!override") || labels.includes("!reset"));
    assert.ok(!labels.includes("volumes"));
    assert.ok(!labels.includes("annotations"));
});

test("completion text edits have ranges", async () => {
    const text = `services:
  web:
    im`;
    const result = await completeComposeDocument(ls, doc(text), {
        line: 2,
        character: 6,
    });
    assert.ok(result);
    const image = result.items.find((item) => item.label.startsWith("image"));
    assert.ok(image);
    if (image.textEdit && "range" in image.textEdit) {
        assert.ok(image.textEdit.range.start.line >= 0);
        assert.ok(image.textEdit.range.end.character >= image.textEdit.range.start.character);
    }
    if (image.insertTextFormat === InsertTextFormat.Snippet) {
        assert.ok(typeof (image.insertText || image.textEdit && "newText" in image.textEdit ? image.textEdit.newText : "") === "string");
    }
});

test("hover returns documentation for image", async () => {
    const text = `services:
  web:
    image: nginx:latest
`;
    const hover = await hoverComposeDocument(ls, doc(text), {
        line: 2,
        character: 6,
    });
    assert.ok(hover);
    const value = typeof hover.contents === "string"
        ? hover.contents
        : Array.isArray(hover.contents)
            ? hover.contents.map((c) => typeof c === "string" ? c : ("value" in c ? c.value : "")).join("\n")
            : ("value" in hover.contents ? hover.contents.value : "");
    assert.ok(/image/i.test(value));
});

test("format normalizes indentation", async () => {
    const text = `services:
    web:
      image: nginx:latest
`;
    const edits = await formatComposeDocument(ls, doc(text));
    assert.ok(edits.length >= 1);
    assert.match(edits[0].newText, /^services:\n {2}web:\n {4}image: nginx:latest\n$/);
});

test("format inserts blank lines between services", async () => {
    const text = `services:
  api:
    image: nginx
  web:
    image: nginx
  db:
    image: postgres
`;
    const edits = await formatComposeDocument(ls, doc(text));
    assert.ok(edits.length >= 1);
    assert.equal(
        edits[0].newText,
        `services:
  api:
    image: nginx

  web:
    image: nginx

  db:
    image: postgres
`
    );
});

test("Compose documentation removes markdown punctuation escapes", async () => {
    const text = `services:
  web:
    ports:
      - "8080:80"
`;
    const hover = await hoverComposeDocument(ls, doc(text), {
        line: 2,
        character: 6,
    });
    assert.ok(hover);
    const value = typeof hover.contents === "string"
        ? hover.contents
        : Array.isArray(hover.contents)
            ? hover.contents.map((part) => typeof part === "string" ? part : part.value).join("\n")
            : hover.contents.value;
    assert.match(value, /\\\[HOST:/);
    assert.match(normalizeComposeDocumentation(value), /\[HOST:\]CONTAINER\[\/PROTOCOL\]/);
    assert.ok(!normalizeComposeDocumentation(value).includes("Compose Specification"));
});

test("schema hover hides any generated schema-title heading but keeps descriptions", () => {
    assert.equal(normalizeComposeDocumentation("#### Settings fixture\n\nWhether the application is enabled."), "Whether the application is enabled.");
    assert.equal(normalizeComposeDocumentation("#### Another schema title\r\n\r\nThe field description."), "The field description.");
    assert.equal(normalizeComposeDocumentation("#### Actual description\nFurther details."), "Further details.");
});

test("schema hints only target mapping key text", () => {
    const text = `services:
  web:
    image: nginx:latest
    environment: {FOO: bar}
"name": demo
# image: ignored
`;
    const state = EditorState.create({ doc: text,
        extensions: [ yaml() ] });
    const at = (part: string, offset = 0) => text.indexOf(part) + offset;

    assert.deepEqual(composeKeyAt(state, at("image")), {
        from: at("image"),
        to: at("image") + "image".length,
    });
    const quotedName = "\"name\"";
    assert.deepEqual(composeKeyAt(state, at(quotedName, 1)), {
        from: at(quotedName),
        to: at(quotedName) + quotedName.length,
    });
    assert.deepEqual(composeKeyAt(state, at("FOO")), {
        from: at("FOO"),
        to: at("FOO") + 3,
    });
    for (const pos of [
        at("image") - 1, // Indentation
        at("image") + 5, // Colon
        at("nginx"), // Value
        at("bar"), // Flow-mapping value
        at("# image"), // Comment
        at("demo"), // Quoted key's value
    ]) {
        assert.equal(composeKeyAt(state, pos), null);
    }
});

test("custom tags !reset and !override do not crash", async () => {
    const diagnostics = await validateComposeDocument(ls, doc(`
services:
  web:
    environment: !override
      FOO: bar
`));
    assert.ok(Array.isArray(diagnostics));
});

test("YamlLanguageClient validates the screenshot YAML without a worker", async () => {
    const client = new YamlLanguageClient();
    const diagnostics = await client.validate(`services:
  1519-api:
    image: busybox:1.36
    command: ["sh", "-c", "httpd -f -p 8080"]
    ports:
      - "18019:8080"
    deploy:
      resources:
        limits:
          memory: 64m
# 秘钥
qgml`, 1);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.range.start.line === 11));
    client.dispose();
});

test("YamlLanguageClient rejects outdated validation", async () => {
    const client = new YamlLanguageClient();
    const pending = client.validate("services: {}\n", 1);
    await client.validate("services: {}\n", 2);
    await assert.rejects(pending, (error: unknown) => error instanceof StaleResponseError);
    client.dispose();
});

test("YamlLanguageClient rejects pending work after disposal", async () => {
    const client = new YamlLanguageClient();
    const pending = client.validate("services: {}\n", 1);
    client.dispose();
    await assert.rejects(pending, (error: unknown) => error instanceof DisposedClientError);
    await assert.rejects(client.validate("services: {}\n", 2), (error: unknown) => error instanceof DisposedClientError);
});
