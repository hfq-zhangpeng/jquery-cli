let webpack = require('webpack');
let path = require("path");
let ExtractTextPlugin = require('extract-text-webpack-plugin');
let os = require('os');
let HappyPack = require('happypack');
let happyThreadPool = HappyPack.ThreadPool({
    size: os.cpus().length
});

let root = path.join(__dirname, '/../../');
module.exports = type => ({
    entry: root + '/src/main.js',
    externals: {
        jquery: 'jQuery',
        components: 'components',
    },
    module: {
        loaders: [{
            // babel-loader配置
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }, {
            test: /\.(png|jpg)$/,
            loader: 'url-loader?limit=5000',
        }, {
            test: /\.html$/,
            exclude: /static/,
            use: "happypack/loader?id=art-template-pack",
        }, {
            test: /\.css$/,

        }, {
            test: /\.css$/,
            use: ExtractTextPlugin.extract({
                fallback: "style-loader",
                use: "happypack/loader?id=css-pack"
            })
        }, {
            test: /\.html$/,
            exclude: /src/,
            loader: 'html-loader'
        }, ],
    },
    plugins: [
        new HappyPack({
            id: 'js-pack',
            loaders: ['babel-loader'],
            threadPool: happyThreadPool,
            verbose: true
        }),
        new HappyPack({
            id: 'css-pack',
            loaders: [{
                    path: 'css-loader',
                    query: {
                        minimize: true,
                        sourceMap: type === 'dev',
                    }
                },
                'postcss-loader',
            ],
            threadPool: happyThreadPool,
            verbose: true
        }),
        new HappyPack({
            id: 'art-template-pack',
            threadPool: happyThreadPool,
            verbose: true,
            loaders: [{
                path: 'art-template-loader',
                query: {
                    extname: '.html',
                    minimize: false,
                    cache: false,
                    htmlMinifierOptions: {
                        collapseWhitespace: true,
                        minifyCSS: false,
                        minifyJS: false,
                    },
                }
            }]
        }),
        new ExtractTextPlugin({
            filename: "[name].css",
            "allChunks": true
        }),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'common',
            filename: 'common.js',
        }),
    ],
    resolve: {
        extensions: ['.js', '.css', '.html'],
        alias: {
            c: root + '/static/lib/c.js',
        },
    }
});