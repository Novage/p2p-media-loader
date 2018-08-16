const path = require('path');

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
          strictExportPresence: true,
          rules: [
            // all files with a `.ts` extension will be handled by `ts-loader`
            { test: /\.ts?$/, loader: "ts-loader" },
          ]
        },
        output: {
            filename: libName + '.umd.js',
            chunkFilename: '[name].js',
            path: path.resolve(__dirname, OUTPUT_PATH),
            publicPath: '/' + OUTPUT_PATH + '/',
            library: libName,
            libraryTarget: 'umd',
            libraryExport: 'default',
            globalObject: 'this'
        },
        plugins: []
    }
};

module.exports = [
    makeConfig({libName: 'P2pMediaLoaderCore', entry: './lib/index', mode: 'development'})
];
