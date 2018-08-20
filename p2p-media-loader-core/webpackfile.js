const path = require('path');
const webpack = require('webpack');

const OUTPUT_PATH = 'build/webpack'

function makeConfig({libName, entry, mode}) {
    return {
        mode,
        entry,
        resolve: {
          // Add `.ts` as a resolvable extension.
          extensions: [".ts", ".js"]
        },
        module: {
          rules: [
            // all files with a `.ts` extension will be handled by `ts-loader`
            { test: /\.ts?$/, exclude: [/node_modules/], loader: "ts-loader" },
          ]
        },
        output: {
            filename: libName + '.umd.js',
            path: path.resolve(__dirname, OUTPUT_PATH),
            publicPath: '/' + OUTPUT_PATH + '/',
            library: libName,
            libraryTarget: 'umd',
        },
        plugins: [
            new webpack.DefinePlugin({
                __VERSION__: JSON.stringify(require('./package.json').version)
            })
        ]
    }
};

module.exports = [
    makeConfig({libName: 'P2pMediaLoaderCore', entry: './lib/index', mode: 'development'})
];
