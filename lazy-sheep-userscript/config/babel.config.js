/**
 * 懒羊羊自动化平台 - Babel配置
 * @author 懒羊羊
 */

module.exports = {
    presets: [
        ['@babel/preset-env', {
            targets: {
                chrome: '90',
                firefox: '88',
                edge: '90'
            },
            modules: false,
            useBuiltIns: 'usage',
            corejs: 3
        }]
    ],

    plugins: [
        // 支持可选链
        '@babel/plugin-proposal-optional-chaining',
        // 支持空值合并
        '@babel/plugin-proposal-nullish-coalescing-operator'
    ],

    env: {
        test: {
            presets: [
                ['@babel/preset-env', {
                    targets: {
                        node: 'current'
                    }
                }]
            ]
        }
    }
};
