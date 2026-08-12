import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import typescript from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    ...typescript.configs.recommended,
    {
        ...react.configs.flat.recommended,
        ...react.configs.flat['jsx-runtime'], // Required for React 17+
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        // scripts/ runs under Node, not in a browser: without this `process` and `Buffer` are
        // flagged as undefined by the browser-globals block above. promo/scripts/ is the same
        // kind of thing for the promo video (see promo/README.md).
        files: ['scripts/**/*.{js,mjs}', 'promo/scripts/**/*.{js,mjs}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        // `check.mjs` is the bundled card-model self-check that CONTRIBUTING and CI both build into
        // the project root. Flat config does not read .gitignore, so ignoring it there is not
        // enough: without this, running the two checks in the order CONTRIBUTING lists them makes
        // the second fail on 236 errors inside the first one's output.
        ignores: ['vendor', 'node_modules', 'public', 'bootstrap/ssr', 'tailwind.config.js', 'check.mjs'],
    },
    prettier, // Turn off all rules that might conflict with Prettier
];
