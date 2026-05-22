"use strict";

const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

const DEV_SERVER_PORT = 9000;

module.exports = (env, argv) => {
    const production = argv.mode === "production";

    return {
        mode: production ? "production" : "development",
        target: "web",

        entry: {
            sandbox: "./examples/main.tsx",
        },

        output: {
            path: __dirname + "/build",
            filename: production ? "[name].min.js" : "[name].js",
        },

        resolve: {
            modules: ["src", "node_modules", "src/third_party/goscorer"],
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js", ".mjs"],
        },

        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    exclude: /node_modules/,
                    loader: "ts-loader",
                    options: {
                        configFile: "tsconfig.json",
                    },
                },
                {
                    test: /\.svg$/,
                    loader: "svg-inline-loader",
                },
            ],
        },

        plugins: [
            new webpack.EnvironmentPlugin({
                NODE_ENV: production ? "production" : "development",
                DEBUG: false,
            }),
            new webpack.DefinePlugin({
                CLIENT: true,
                SERVER: false,
            }),
        ],

        optimization: {
            minimizer: [new TerserPlugin({ terserOptions: {} })],
        },

        devtool: "source-map",

        devServer: {
            compress: true,
            host: "0.0.0.0",
            port: DEV_SERVER_PORT,
            allowedHosts: ["all"],
            static: [
                path.join(__dirname, "assets"),
                path.join(__dirname, "test"),
                path.join(__dirname, "build"),
                path.join(__dirname, "examples"),
                path.join(__dirname, "src"),
            ],
            historyApiFallback: { index: "index.html" },
            devMiddleware: {
                index: true,
                mimeTypes: { phtml: "text/html" },
                serverSideRender: true,
                writeToDisk: true,
            },
            hot: false,
            setupMiddlewares: (middlewares) => {
                console.log("------------------");
                console.log("Sandbox served at http://localhost:" + DEV_SERVER_PORT);
                console.log("------------------");
                return middlewares;
            },
        },
    };
};
