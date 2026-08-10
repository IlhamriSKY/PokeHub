<?php

return [

    /*
     * Only the `testing` block is overridden here; everything else keeps the package defaults.
     * mergeConfigFrom() is a SHALLOW array_merge, so this key replaces the package's `testing`
     * block whole - all three settings have to be restated, not just the one being changed.
     */
    'testing' => [

        'ensure_pages_exist' => true,

        /*
         * Inertia's own default is `resource_path('js/Pages')` - capital P. This project's pages
         * live in `resources/js/pages`, which is the same directory on Windows and macOS and
         * NOTHING on Linux. So `assertInertia(...)` passed on every developer machine and failed
         * nine tests the first time CI ran on ubuntu-latest, with "Inertia page component file
         * [dashboard] does not exist". Point it at the real casing.
         */
        'page_paths' => [
            resource_path('js/pages'),
        ],

        'page_extensions' => [
            'js',
            'jsx',
            'svelte',
            'ts',
            'tsx',
            'vue',
        ],

    ],

];
