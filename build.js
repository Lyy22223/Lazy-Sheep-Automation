const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// 配置
const CONFIG = {
    sourceFile: path.join(__dirname, 'scripts', 'czbk_complete.user.js'),
    outputDir: path.join(__dirname, 'dist'),
    outputFile: 'czbk_complete.prod.user.js',
    devMode: process.argv.includes('--dev')
};

/**
 * 日志保留白名单关键词（包含这些关键词的日志会保留）
 */
const LOG_WHITELIST_KEYWORDS = [
    '✅', '❌', '⚠️', '📝', '🔧', '🔍', '📦', '💾', '🚀', // 常用图标
    '答题', '纠错', '成功', '失败', '完成', '错误', '答对', '答错',
    '填充', '选择', '提交', '批量', '自动',
    '开始', '结束', '跳过', '已', '已缓存', '已保存',
    '题目', '答案', '结果', '检测到', '拉取',
    'API', '后端', '接口', '调用'
];

/**
 * 日志移除黑名单关键词（包含这些关键词的日志会被移除）
 */
const LOG_BLACKLIST_KEYWORDS = [
    '响应:', '原始数据:', '格式解析', 'JSON.stringify',
    '详细信息', '调试', '开发环境', '开发模式',
    '⚠️ 未配置', '⚠️ 无法获取', '⚠️ 解析', '⚠️ 检查',
    '通过', '使用', '加载', '初始化', '已加载'
];

/**
 * 检查日志是否应该保留
 */
function shouldKeepLog(lineContent) {
    const content = lineContent.toLowerCase();
    
    // 先检查黑名单（黑名单优先级更高）
    for (const keyword of LOG_BLACKLIST_KEYWORDS) {
        if (content.includes(keyword.toLowerCase())) {
            return false;
        }
    }
    
    // 检查白名单
    for (const keyword of LOG_WHITELIST_KEYWORDS) {
        if (content.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    // 默认移除（调试日志）
    return false;
}

/**
 * 移除日志调用（智能保留重要日志）
 * 只移除调试日志，保留关键的答题相关日志
 */
function removeLogs(code) {
    const lines = code.split('\n');
    const result = [];
    let inMultiLineLog = false;
    let openParens = 0;
    let logStartLine = -1;
    let logContent = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // 检查是否是日志调用开始
        const logMatch = line.match(/(utils\.log|console\.(log|debug|info))\s*\(/);
        
        if (logMatch && !inMultiLineLog) {
            // 开始一个日志调用
            inMultiLineLog = true;
            logStartLine = i;
            logContent = [line];
            openParens = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
            
            // 检查是否在同一行结束
            const closeParens = (line.match(/\)/g) || []).length;
            if (openParens <= 0 && closeParens > 0) {
                // 单行日志，检查是否保留
                const shouldKeep = shouldKeepLog(line);
                inMultiLineLog = false;
                if (!shouldKeep) {
                    // 移除这一行
                    continue;
                } else {
                    // 保留这一行
                    result.push(line);
                    continue;
                }
            }
            // 多行日志，继续收集
            continue;
        }
        
        if (inMultiLineLog) {
            logContent.push(line);
            // 计算括号平衡
            openParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
            
            // 检查是否结束
            if (openParens <= 0) {
                // 日志调用结束，检查是否保留
                const fullLogContent = logContent.join('\n');
                const shouldKeep = shouldKeepLog(fullLogContent);
                inMultiLineLog = false;
                
                if (!shouldKeep) {
                    // 移除这些行，跳过
                    continue;
                } else {
                    // 保留这些行
                    result.push(...logContent);
                    continue;
                }
            } else {
                // 继续多行日志，收集内容
                continue;
            }
        }
        
        // 不是日志调用，保留这一行
        result.push(line);
    }
    
    // 清理连续空行（最多保留2个空行）
    let cleaned = result.join('\n');
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    
    return cleaned;
}

/**
 * 保留 UserScript 头部元数据
 */
function extractMetadata(code) {
    const metadataMatch = code.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
    if (metadataMatch) {
        return metadataMatch[0];
    }
    return '';
}

/**
 * 使用 Terser 混淆和压缩代码
 */
async function minifyCode(code, metadata) {
    const terserOptions = {
        compress: {
            // 压缩选项
            drop_console: false, // 不自动移除 console（我们已经手动移除了）
            drop_debugger: true,
            pure_funcs: [], // 纯函数调用，会被移除
            passes: 2, // 多次压缩以获取更好的结果
        },
        mangle: {
            // 混淆选项（中等级别）
            toplevel: false, // 不混淆顶级作用域（避免破坏 UserScript API）
            keep_classnames: false,
            keep_fnames: false, // 混淆函数名
            reserved: [
                // 保留的全局变量名（UserScript API 和页面 API）
                'GM_setValue',
                'GM_getValue',
                'GM_xmlhttpRequest',
                'GM_addStyle',
                'GM_getResourceText',
                'window',
                'document',
                'console',
                'localStorage',
                'sessionStorage',
                'Vue',
                'ElementPlus',
                // 常见的页面 API
                'jQuery',
                '$',
                'location',
                'history'
            ]
        },
        format: {
            // 格式化选项
            comments: false, // 移除所有注释
            beautify: false, // 不美化代码
            ascii_only: false, // 允许 Unicode 字符
        },
        sourceMap: false, // 不生成 source map
        toplevel: false, // 不混淆顶级作用域
    };
    
    try {
        const result = await minify(code, terserOptions);
        return result.code;
    } catch (error) {
        console.error('Terser 压缩失败:', error);
        throw error;
    }
}

/**
 * 主构建函数
 * 懒羊羊自动化平台 - 传智播客答题脚本构建工具
 */
async function build() {
    console.log('🚀 懒羊羊自动化平台 - 开始构建传智播客答题脚本生产版本...');
    console.log(`源文件: ${CONFIG.sourceFile}`);
    console.log(`输出目录: ${CONFIG.outputDir}`);
    console.log(`开发模式: ${CONFIG.devMode ? '是' : '否'}`);
    
    // 检查源文件是否存在
    if (!fs.existsSync(CONFIG.sourceFile)) {
        console.error(`❌ 源文件不存在: ${CONFIG.sourceFile}`);
        process.exit(1);
    }
    
    // 读取源文件
    console.log('📖 读取源文件...');
    let code = fs.readFileSync(CONFIG.sourceFile, 'utf8');
    
    // 提取元数据
    const metadata = extractMetadata(code);
    if (!metadata) {
        console.warn('⚠️  未找到 UserScript 元数据头');
    }
    
    // 移除元数据部分（后续会重新添加）
    code = code.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*\n*/, '');
    
    if (!CONFIG.devMode) {
        // 移除日志
        console.log('🧹 移除日志调用...');
        code = removeLogs(code);
        
        // 混淆和压缩
        console.log('🔧 混淆和压缩代码...');
        code = await minifyCode(code, metadata);
    } else {
        console.log('ℹ️  开发模式：跳过日志移除和混淆');
    }
    
    // 重新添加元数据头（在最前面）
    if (metadata) {
        code = metadata + '\n\n' + code;
    }
    
    // 创建输出目录
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        console.log(`📁 创建输出目录: ${CONFIG.outputDir}`);
    }
    
    // 写入输出文件
    const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFile);
    fs.writeFileSync(outputPath, code, 'utf8');
    
    // 统计信息
    const originalSize = fs.statSync(CONFIG.sourceFile).size;
    const outputSize = fs.statSync(outputPath).size;
    const compressionRatio = ((1 - outputSize / originalSize) * 100).toFixed(2);
    
    console.log('\n✅ 构建完成！');
    console.log(`📦 输出文件: ${outputPath}`);
    console.log(`📊 文件大小: ${(originalSize / 1024).toFixed(2)} KB → ${(outputSize / 1024).toFixed(2)} KB`);
    console.log(`📉 压缩率: ${compressionRatio}%`);
    
    return outputPath;
}

// 执行构建
build().catch(error => {
    console.error('❌ 构建失败:', error);
    process.exit(1);
});
