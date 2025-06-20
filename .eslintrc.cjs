module.exports = {
    env: {
        browser: true,
        es6: true,
    },
    extends: [
        `plugin:vue/vue3-essential`,
        `plugin:@typescript-eslint/eslint-recommended`,
        `plugin:sonarjs/recommended`,
        `plugin:unicorn/recommended`,
        `plugin:storybook/recommended`,
    ],
    globals: {
        Atomics: `readonly`,
        SharedArrayBuffer: `readonly`,
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: `module`,
        "parser": {
            "ts": `@typescript-eslint/parser`,
            "<template>": `espree`,
        },
    },
    plugins: [`vue`, `@typescript-eslint`, `no-switch-statements`, `sonarjs`, `unicorn`],
    overrides: [
        {
            files: [`*.vue`],
            parser: `vue-eslint-parser`,
        },
        {
            // Match all .js/.jsx/.ts/.tsx files in the immediate root directory "special-dir"
            files: ['backend/**/*.ts'],

            // You can also further narrow by excludedFiles if needed:
            // excludedFiles: '*.test.js',

            // And then set the rules you want for this dir
            rules: {
                quotes: [`warn`, `double`],
            },
        },
    ],
    rules: {
        "unicorn/prefer-string-replace-all": `off`,
        "vue/no-v-text-v-html-on-component": `off`,
        "vue/no-v-model-argument": `off`,
        "vue/multi-word-component-names": `off`,
        "vue/no-deprecated-slot-attribute": `off`,
        indent: [`warn`, 4],
        "linebreak-style": [`warn`, `unix`],
        quotes: [`warn`, `backtick`],
        "comma-dangle": [`warn`, `always-multiline`],
        semi: [`warn`, `always`],
        "require-await": `off`,
        "vue/html-indent": [`warn`, 4],
        "vue/no-v-html": `off`,
        "vue/first-attribute-linebreak": [`warn`, { singleline: `ignore`, multiline: `below` }],
        "vue/max-attributes-per-line": [
            `warn`,
            {
                singleline: 1,
                multiline: 1,
            },
        ],
        "vue/html-closing-bracket-newline": [`warn`, {
            "singleline": `never`,
            "multiline": `always`,
        }],
        "vue/no-ref-as-operand": `error`,
        "vue/attribute-hyphenation": `warn`,
        "vue/component-definition-name-casing": [`warn`, `kebab-case`],
        "lines-between-class-members": [`warn`],
        "vue/html-closing-bracket-spacing": [`warn`, {
            "startTag": `never`,
            "endTag": `never`,
            "selfClosingTag": `always`,
        }],
        "vue/html-self-closing": [`warn`, {
            "html": {
                "void": `always`,
                "normal": `always`,
                "component": `always`,
            },
            "svg": `always`,
            "math": `always`,
        }],
        "vue/multiline-html-element-content-newline": [`warn`, {
            "ignoreWhenEmpty": true,
            "ignores": [`pre`, `textarea`],
            "allowEmptyLines": false,
        }],
        "vue/no-multi-spaces": [`warn`, {
            "ignoreProperties": false,
        }],
        "vue/mustache-interpolation-spacing": [`warn`, `always`],
        "vue/no-spaces-around-equal-signs-in-attribute": [`warn`],
        "vue/require-prop-types": [`error`],
        "vue/v-bind-style": [`warn`, `shorthand`],
        "vue/v-on-style": [`warn`, `shorthand`],
        "vue/v-slot-style": [`warn`, {
            "atComponent": `shorthand`,
            "default": `shorthand`,
            "named": `shorthand`,
        }],
        "vue/v-on-event-hyphenation": [`warn`, `always`, {
            "autofix": true,
            "ignore": [],
        }],
        "vue/attributes-order": [`warn`, {
            "order": [
                `DEFINITION`,
                `LIST_RENDERING`,
                `CONDITIONALS`,
                `RENDER_MODIFIERS`,
                `GLOBAL`,
                [`UNIQUE`, `SLOT`],
                `TWO_WAY_BINDING`,
                `OTHER_DIRECTIVES`,
                `OTHER_ATTR`,
                `EVENTS`,
                `CONTENT`,
            ],
            "alphabetical": false,
        }],
        "vue/block-lang": [`error`,
            {
                "script": {
                    "lang": `ts`,
                },
                "template": {
                    "lang": `html`,
                },
            },
        ],
        "vue/component-api-style": [`error`,
            [`script-setup`, `options`],
        ],
        "vue/component-name-in-template-casing": [`warn`, `kebab-case`, {
            "registeredComponentsOnly": false,
            "ignores": [],
        }],
        "vue/custom-event-name-casing": [`error`,
            `kebab-case`,
            {
                "ignores": [],
            },
        ],
        "vue/define-emits-declaration": [`error`, `type-based`],
        "vue/define-macros-order": [`warn`, {
            "order": [`defineProps`, `defineEmits`],
        }],
        "vue/define-props-declaration": [`error`, `runtime`],
        "vue/html-comment-content-spacing": [`warn`,
            `always`,
            {
                "exceptions": [],
            },
        ],
        "vue/padding-line-between-blocks": [`warn`, `always`],
        "vue/padding-line-between-tags": [`warn`, [
            { blankLine: `always`, prev: `*`, next: `*` },
        ]],
        "vue/prefer-separate-static-class": [`warn`],
        "vue/prefer-true-attribute-shorthand": [`error`],
        "vue/require-macro-variable-name": [`error`, {
            "defineProps": `props`,
            "defineEmits": `emit`,
            "defineSlots": `slots`,
            "useSlots": `slots`,
            "useAttrs": `attrs`,
        }],
        eqeqeq: `off`,
        "import/no-named-as-default": `off`,
        "accessor-pairs": `off`,
        "no-unused-expressions": `off`,
        "no-useless-escape": `off`,
        "space-before-function-paren": [`error`, `never`],
        "arrow-parens": [`error`, `as-needed`],
        "no-switch-statements/no-switch": `warn`,
        "unicorn/prevent-abbreviations": [
            `warn`,
            {
                "allowList": {
                    "attrs": true,
                    "props": true,
                    "Ref": true,
                },
                checkFilenames: false,
            },
        ],
        "unicorn/prefer-top-level-await": `off`,
        "unicorn/explicit-length-check": `off`,
        "unicorn/consistent-function-scoping": `off`,
        "unicorn/no-new-array": `off`,
        "unicorn/no-array-callback-reference": `off`,
        "sonarjs/no-nested-template-literals": `off`,
    },
};
