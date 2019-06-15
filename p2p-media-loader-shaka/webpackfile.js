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
        },
        externals: {
            "p2p-media-loader-core": "window.p2pml.core",
            "debug": "window.p2pml._shared.debug",
            "events": "window.p2pml._shared.events",
        },
        plugins: [
            new webpack.DefinePlugin({
                __P2PML_VERSION__: JSON.stringify(require("./package.json").version)
            })
        ]
    }
}
module.exports = [
    makeConfig({entry: "./lib/browser-init-webpack.js", mode: "development", libName: "p2p-media-loader-shaka", }),
    makeConfig({entry: "./lib/browser-init-webpack.js", mode: "production", libName: "p2p-media-loader-shaka.min"})
];
