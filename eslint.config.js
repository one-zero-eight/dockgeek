import js from "@eslint/js";
import globals from "globals";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";

const files = [ "**/*.{ts,vue}" ];

export default [
    {
        ignores: [ "frontend-dist/**", "node_modules/**" ],
    },
    {
        files,
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            "@stylistic": stylistic,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
            "no-undef": "off",
            "no-useless-assignment": "off",
            "preserve-caught-error": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [ "warn", { args: "none", caughtErrors: "none" } ],
            "@typescript-eslint/ban-ts-comment": "off",
            "yoda": "error",
            "camelcase": [ "warn", { properties: "never", ignoreImports: true, allow: [ "^CONSOLE_STYLE_" ] } ],
            "@stylistic/linebreak-style": [ "error", "unix" ],
            "@stylistic/indent": [ "error", 4, { ignoredNodes: [ "TemplateLiteral" ], SwitchCase: 1 } ],
            "@stylistic/quotes": [ "error", "double" ],
            "@stylistic/semi": "error",
            "no-multi-spaces": [ "error", { ignoreEOLComments: true } ],
            "@stylistic/array-bracket-spacing": [ "warn", "always", { singleValue: true, objectsInArrays: false, arraysInArrays: false } ],
            "@stylistic/space-before-function-paren": [ "error", { anonymous: "always", named: "never", asyncArrow: "always" } ],
            "curly": "error",
            "@stylistic/object-curly-spacing": [ "error", "always" ],
            "@stylistic/object-curly-newline": "off",
            "@stylistic/object-property-newline": "off",
            "@stylistic/comma-spacing": "error",
            "@stylistic/brace-style": "error",
            "no-var": "error",
            "@stylistic/key-spacing": [ "warn", { mode: "minimum" } ],
            "@stylistic/keyword-spacing": "warn",
            "@stylistic/space-infix-ops": "error",
            "@stylistic/arrow-spacing": "warn",
            "@stylistic/no-trailing-spaces": "error",
            "no-constant-condition": [ "error", { checkLoops: false } ],
            "@stylistic/space-before-blocks": "warn",
            "no-extra-boolean-cast": "off",
            "@stylistic/no-multiple-empty-lines": [ "warn", { max: 1, maxBOF: 0 } ],
            "@stylistic/lines-between-class-members": [ "warn", "always", { exceptAfterSingleLine: true } ],
            "no-unneeded-ternary": "error",
            "@stylistic/array-bracket-newline": [ "error", "consistent" ],
            "@stylistic/eol-last": [ "error", "always" ],
            "@stylistic/comma-dangle": [ "warn", "only-multiline" ],
            "no-empty": [ "error", { allowEmptyCatch: true } ],
            "no-control-regex": "off",
            "one-var": [ "error", "never" ],
            "@stylistic/max-statements-per-line": [ "error", { max: 1 } ],
            "prefer-const": "off",
        },
    },
    ...vue.configs["flat/recommended"].map(config => ({ ...config, files })),
    {
        files: [ "**/*.ts" ],
        languageOptions: { parser: tsParser },
    },
    {
        files: [ "**/*.vue" ],
        languageOptions: {
            parser: vueParser,
            parserOptions: { parser: tsParser },
        },
        rules: {
            "vue/html-indent": [ "error", 4 ],
            "vue/max-attributes-per-line": "off",
            "vue/singleline-html-element-content-newline": "off",
            "vue/html-self-closing": "off",
            "vue/require-component-is": "off",
            "vue/attribute-hyphenation": "off",
            "vue/multi-word-component-names": "off",
        },
    },
];
