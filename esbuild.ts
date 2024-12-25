import { build } from 'esbuild';

async function buildLibrary() {
    try {
        // ESM Build
        await build({
            platform: 'node',
            entryPoints: ['./src/index.ts'],
            bundle: true,
            format: 'esm',
            outfile: './dist/index.mjs'
        });

        // CJS Build
        await build({
            platform: 'node',
            entryPoints: ['./src/index.ts'],
            bundle: true,
            format: 'cjs',
            outfile: './dist/index.cjs'
        });

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

await buildLibrary();
