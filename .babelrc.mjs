// @ts-check
'use strict';
// noinspection JSUnusedGlobalSymbols
export default {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    // eslint-disable-next-line no-undef
                    node: process.version,
                },
            },
        ],
        '@babel/preset-typescript',
    ],
};