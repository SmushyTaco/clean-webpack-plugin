import { deleteSync } from 'del';
import path from 'node:path';
import webpack from 'webpack';
import isPlainObject from 'is-plain-obj';

export interface Options {
    /**
     * Simulate the removal of files
     *
     * default: false
     */
    dry?: boolean;

    /**
     * Write Logs to Console
     * (Always enabled when dry is true)
     *
     * default: false
     */
    verbose?: boolean;

    /**
     * Automatically remove all unused webpack assets on rebuild
     *
     * default: true
     */
    cleanStaleWebpackAssets?: boolean;

    /**
     * Do not allow removal of current webpack assets
     *
     * default: true
     */
    protectWebpackAssets?: boolean;

    /**
     * Removes files once prior to Webpack compilation
     *   Not included in rebuilds (watch mode)
     *
     * Use !negative patterns to exclude files
     *
     * default: ['**\/*']
     */
    cleanOnceBeforeBuildPatterns?: string[];

    /**
     * Removes files after every build (including watch mode) that match this pattern.
     * Used for files that are not created directly by Webpack.
     *
     * Use !negative patterns to exclude files
     *
     * default: []
     */
    cleanAfterEveryBuildPatterns?: string[];

    /**
     * Allow clean patterns outside of process.cwd()
     *
     * requires dry option to be explicitly set
     *
     * default: false
     */
    dangerouslyAllowCleanPatternsOutsideProject?: boolean;
}

class CleanWebpackPlugin {
    private readonly dry: boolean;
    private readonly verbose: boolean;
    private readonly cleanStaleWebpackAssets: boolean;
    private readonly protectWebpackAssets: boolean;
    private readonly cleanAfterEveryBuildPatterns: string[];
    private readonly cleanOnceBeforeBuildPatterns: string[];
    private readonly dangerouslyAllowCleanPatternsOutsideProject: boolean;
    private currentAssets: string[];
    private initialClean: boolean;
    private outputPath: string;

    constructor(options: Options = {}) {
        if (!isPlainObject(options)) {
            throw new Error(`clean-webpack-plugin only accepts an options object. See:
            https://github.com/SmushyTaco/clean-webpack-plugin#options-and-defaults-optional`);
        }

        if (
            options.dangerouslyAllowCleanPatternsOutsideProject === true &&
            options.dry !== true &&
            options.dry !== false
        ) {
            console.warn(
                'clean-webpack-plugin: dangerouslyAllowCleanPatternsOutsideProject requires dry: false to be explicitly set. Enabling dry mode'
            );
        }

        this.dangerouslyAllowCleanPatternsOutsideProject =
            options.dangerouslyAllowCleanPatternsOutsideProject === true ||
            false;

        this.dry =
            options.dry === true || options.dry === false
                ? options.dry
                : this.dangerouslyAllowCleanPatternsOutsideProject || false;

        this.verbose = this.dry || options.verbose === true || false;

        this.cleanStaleWebpackAssets =
            options.cleanStaleWebpackAssets === true ||
            options.cleanStaleWebpackAssets === false
                ? options.cleanStaleWebpackAssets
                : true;

        this.protectWebpackAssets =
            options.protectWebpackAssets === true ||
            options.protectWebpackAssets === false
                ? options.protectWebpackAssets
                : true;

        this.cleanAfterEveryBuildPatterns = Array.isArray(
            options.cleanAfterEveryBuildPatterns
        )
            ? options.cleanAfterEveryBuildPatterns
            : [];

        this.cleanOnceBeforeBuildPatterns = Array.isArray(
            options.cleanOnceBeforeBuildPatterns
        )
            ? options.cleanOnceBeforeBuildPatterns
            : ['**/*'];

        /**
         * Store webpack build assets
         */
        this.currentAssets = [];

        /**
         * Only used with cleanOnceBeforeBuildPatterns
         */
        this.initialClean = false;

        this.outputPath = '';

        this.apply = this.apply.bind(this);
        this.handleInitial = this.handleInitial.bind(this);
        this.handleDone = this.handleDone.bind(this);
        this.removeFiles = this.removeFiles.bind(this);
    }

    apply(compiler: webpack.Compiler) {
        if (!compiler.options.output?.path) {
            console.warn(
                'clean-webpack-plugin: options.output.path not defined. Plugin disabled...'
            );

            return;
        }

        this.outputPath = compiler.options.output.path;

        /**
         * webpack 4+ comes with a new plugin system.
         *
         * Check for hooks in-order to support old plugin system
         * webpack 5+ removed the old system, the check now breaks
         */
        const hooks = compiler.hooks;

        if (this.cleanOnceBeforeBuildPatterns.length > 0) {
            hooks.emit.tap('clean-webpack-plugin', (compilation) => {
                this.handleInitial(compilation);
            });
        }

        hooks.done.tap('clean-webpack-plugin', (stats) => {
            this.handleDone(stats);
        });
    }

    /**
     * Initially remove files from output directory prior to build.
     *
     * Only happens once.
     *
     * Warning: It is recommended to initially clean your build directory outside of webpack to minimize unexpected behavior.
     */
    handleInitial(compilation: webpack.Compilation) {
        if (this.initialClean) {
            return;
        }

        /**
         * Do not remove files if there are compilation errors
         *
         * Handle logging inside this.handleDone
         */
        const stats = compilation.getStats();
        if (stats.hasErrors()) {
            return;
        }

        this.initialClean = true;

        this.removeFiles(this.cleanOnceBeforeBuildPatterns);
    }

    handleDone(stats: webpack.Stats) {
        /**
         * Do nothing if there is a webpack error
         */
        if (stats.hasErrors()) {
            if (this.verbose) {
                console.warn(
                    'clean-webpack-plugin: pausing due to webpack errors'
                );
            }

            return;
        }

        /**
         * Fetch Webpack output asset files
         */
        const assetList = Object.keys(stats.compilation.assets);

        /**
         * Get all files that were in the previous build but not the current
         *
         * (relies on del's cwd: outputPath option)
         */
        const staleFiles = this.currentAssets.filter((previousAsset) => {
            return !assetList.includes(previousAsset);
        });

        /**
         * Save assets for next compilation
         */
        this.currentAssets = assetList.toSorted((a, b) => a.localeCompare(b));

        const removePatterns = [];

        /**
         * Remove unused webpack assets
         */
        if (this.cleanStaleWebpackAssets && staleFiles.length > 0) {
            removePatterns.push(...staleFiles);
        }

        /**
         * Remove cleanAfterEveryBuildPatterns
         */
        if (this.cleanAfterEveryBuildPatterns.length > 0) {
            removePatterns.push(...this.cleanAfterEveryBuildPatterns);
        }

        if (removePatterns.length > 0) {
            this.removeFiles(removePatterns);
        }
    }

    removeFiles(patterns: string[]) {
        try {
            const deleted = deleteSync(patterns, {
                force: this.dangerouslyAllowCleanPatternsOutsideProject,
                cwd: this.outputPath,
                dryRun: this.dry,
                dot: true,
                ignore: this.protectWebpackAssets ? this.currentAssets : []
            });

            /**
             * Log if verbose is enabled
             */
            if (this.verbose) {
                for (const file of deleted) {
                    const filename = path.relative(process.cwd(), file);

                    const message = this.dry ? 'dry' : 'removed';

                    /**
                     * Use console.warn over .log
                     * https://github.com/webpack/webpack/issues/1904
                     * https://github.com/johnagan/clean-webpack-plugin/issues/11
                     */
                    console.warn(
                        `clean-webpack-plugin: ${message} ${filename}`
                    );
                }
            }
        } catch (error) {
            const needsForce =
                error instanceof Error &&
                /Cannot delete files\/folders outside the current working directory\./.test(
                    error.message
                );

            if (needsForce) {
                const message =
                    'clean-webpack-plugin: Cannot delete files/folders outside the current working directory. Can be overridden with the `dangerouslyAllowCleanPatternsOutsideProject` option.';

                throw new Error(message);
            }
            throw error;
        }
    }
}

export { CleanWebpackPlugin };
