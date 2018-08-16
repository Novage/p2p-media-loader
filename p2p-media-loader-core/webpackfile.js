function makeConfig({entry, mode}) {
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
        }
    }
};

module.exports = [
    makeConfig({entry: './lib/index', mode: 'development'})
];
