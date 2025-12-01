/**
 * 懒羊羊自动化平台 - Webpack配置
 * @author 懒羊羊
 */

const path = require('path');
const fs = require('fs');
const { VueLoaderPlugin } = require('vue-loader');
const WebpackObfuscator = require('webpack-obfuscator');

// 读取userscript头部
const userscriptHeader = fs.readFileSync(
    path.resolve(__dirname, 'userscript-header.js'),
    'utf-8'
);

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';
    // 是否启用代码混淆（默认禁用，因为会导致文件体积暴增3-5倍）
    // 对于油猴脚本，混淆不是必需的，Webpack的minimize已经足够
    const enableObfuscation = process.env.OBFUSCATE === 'true';

    return {
        entry: './src/main.js',

        output: {
            path: path.resolve(__dirname, '../dist'),
            filename: isProduction
                ? 'lazy-sheep-auto-answer.user.js'
                : 'lazy-sheep-auto-answer.dev.user.js',
            clean: true
        },

        module: {
            rules: [
                // Vue单文件组件
                {
                    test: /\.vue$/,
                    loader: 'vue-loader'
                },

                // JavaScript
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                ['@babel/preset-env', {
                                    targets: {
                                        chrome: '90',
                                        firefox: '88',
                                        edge: '90'
                                    },
                                    useBuiltIns: 'usage',
                                    corejs: 3
                                }]
                            ]
                        }
                    }
                },

                // CSS
                {
                    test: /\.css$/,
                    use: [
                        'style-loader',
                        'css-loader'
                    ]
                }
            ]
        },

        resolve: {
            extensions: ['.js', '.vue'],
            alias: {
                '@': path.resolve(__dirname, '../src'),
                '@core': path.resolve(__dirname, '../src/core'),
                '@platforms': path.resolve(__dirname, '../src/platforms'),
                '@modules': path.resolve(__dirname, '../src/modules'),
                '@network': path.resolve(__dirname, '../src/network'),
                '@ui': path.resolve(__dirname, '../src/ui'),
                'vue': 'vue/dist/vue.runtime.esm-bundler.js'
            }
        },

        optimization: {
            minimize: isProduction,
            usedExports: true,
            // Tree shaking - 移除未使用的代码
            sideEffects: false
        },

        plugins: [
            // Vue Loader插件
            new VueLoaderPlugin(),

            // 添加userscript头部（开发模式下动态版本号）
            {
                apply: (compiler) => {
                    compiler.hooks.emit.tapAsync('UserscriptHeaderPlugin', (compilation, callback) => {
                        Object.keys(compilation.assets).forEach(filename => {
                            if (filename.endsWith('.user.js')) {
                                const asset = compilation.assets[filename];
                                const source = asset.source();
                                
                                // 开发模式下使用时间戳版本号，确保油猴能检测到更新
                                let header = userscriptHeader;
                                if (!isProduction) {
                                    // 生成完整时间戳: YYYYMMDDHHmmss
                                    const now = new Date();
                                    const timestamp = [
                                        now.getFullYear(),
                                        String(now.getMonth() + 1).padStart(2, '0'),
                                        String(now.getDate()).padStart(2, '0'),
                                        String(now.getHours()).padStart(2, '0'),
                                        String(now.getMinutes()).padStart(2, '0'),
                                        String(now.getSeconds()).padStart(2, '0')
                                    ].join('');
                                    
                                    header = header.replace(
                                        /@version\s+[\d.a-zA-Z-]+/,
                                        `@version      2.0.0-dev.${timestamp}`
                                    );
                                }
                                
                                const newSource = header + '\n' + source;

                                compilation.assets[filename] = {
                                    source: () => newSource,
                                    size: () => newSource.length
                                };
                            }
                        });
                        callback();
                    });
                }
            },

            // 可选的代码混淆（默认禁用）
            // 启用方式: OBFUSCATE=true npm run build
            // 注意：混淆会导致文件体积暴增（3-5倍），影响加载性能
            // 对于油猴脚本，Webpack的minimize压缩已经足够
            ...(isProduction && enableObfuscation ? [
                new WebpackObfuscator({
                    // 基础混淆
                    compact: true,
                    identifierNamesGenerator: 'hexadecimal',
                    
                    // 禁用会大幅增加体积的选项
                    stringArray: false,              // ❌ 禁用字符串数组（会增大3倍）
                    rotateStringArray: false,        // ❌ 禁用
                    stringArrayThreshold: 0,         // ❌ 禁用
                    controlFlowFlattening: false,    // ❌ 禁用控制流扁平化（增大2倍）
                    deadCodeInjection: false,        // ❌ 禁用死代码注入（增大1.5倍）
                    
                    // 基础保护
                    renameGlobals: false,
                    selfDefending: false,            // ❌ 禁用自我保护（会增大）
                    debugProtection: false,
                    disableConsoleOutput: false,
                    
                    // 保留油猴API
                    reservedNames: [
                        'GM_getValue',
                        'GM_setValue',
                        'GM_xmlhttpRequest',
                        'GM_addStyle',
                        'GM_registerMenuCommand',
                        'GM_unregisterMenuCommand',
                        'unsafeWindow'
                    ],
                    
                    target: 'browser',
                    log: false
                }, [])
            ] : [])
        ],

        devtool: isProduction ? false : 'inline-source-map',

        mode: isProduction ? 'production' : 'development',

        watch: !isProduction,

        watchOptions: {
            ignored: /node_modules/,
            aggregateTimeout: 300,
            poll: 1000
        },

        stats: {
            colors: true,
            modules: false,
            children: false,
            chunks: false,
            chunkModules: false
        }
    };
};
