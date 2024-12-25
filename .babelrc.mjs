// @ts-check
'use strict';
// noinspection JSUnusedGlobalSymbols
export default {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: process.version
                }
            }
        ],
        '@babel/preset-typescript'
    ]
};
