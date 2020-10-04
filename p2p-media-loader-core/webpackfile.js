const path = require("path");
const webpack = require("webpack");

const OUTPUT_PATH = "build";

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
            filename: libName + ".js",
            path: path.resolve(__dirname, OUTPUT_PATH)
        }
    }
};

module.exports = [
    makeConfig({entry: "./lib/browser-init-webpack.ts", mode: "development", libName: "p2p-media-loader-core", }),
    makeConfig({entry: "./lib/browser-init-webpack.ts", mode: "production", libName: "p2p-media-loader-core.min"})
];
