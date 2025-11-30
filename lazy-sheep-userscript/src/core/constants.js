/**
 * 懒羊羊自动化平台 - 常量定义
 * @author 懒羊羊
 * @description 定义所有项目中使用的常量
 */

/**
 * 题目类型
 */
export const QUESTION_TYPES = {
    DANXUAN: '0',    // 单选题
    DUOXUAN: '1',    // 多选题
    PANDUAN: '2',    // 判断题
    TIANKONG: '3',   // 填空题
    JIANDA: '4',     // 简答题
    BIANCHENG: '5'   // 编程题
};

/**
 * 题目类型中文名称
 */
export const QUESTION_TYPE_NAMES = {
    [QUESTION_TYPES.DANXUAN]: '单选题',
    [QUESTION_TYPES.DUOXUAN]: '多选题',
    [QUESTION_TYPES.PANDUAN]: '判断题',
    [QUESTION_TYPES.TIANKONG]: '填空题',
    [QUESTION_TYPES.JIANDA]: '简答题',
    [QUESTION_TYPES.BIANCHENG]: '编程题'
};

/**
 * 正则表达式模式 (缓存优化)
 */
export const REGEX_PATTERNS = {
    SINGLE_LETTER: /^[A-Z]$/,                // 单个字母 A-Z
    SPLIT_COMMA: /[,，]/,                    // 逗号分隔
    REMOVE_NUMBER: /^\d+[、.]\s*/,           // 移除编号
    HTML_TAG: /<[^>]+>/g,                    // HTML标签
    WHITESPACE: /\s+/g,                      // 空白字符
    CHINESE_CHAR: /[\u4e00-\u9fa5]/          // 中文字符
};

/**
 * 答案格式
 */
export const ANSWER_FORMATS = {
    LETTER: 'letter',                        // 字母格式 (A, B, C)
    INDEX: 'index',                          // 索引格式 (0, 1, 2)
    TEXT: 'text',                            // 文本格式
    JSON: 'json',                            // JSON格式
    BOOLEAN: 'boolean'                       // 布尔值
};

/**
 * 判断题答案映射
 */
export const JUDGMENT_ANSWERS = {
    TRUE: ['对', '正确', 'true', '1', 'T', 'TRUE'],
    FALSE: ['错', '错误', 'false', '0', 'F', 'FALSE']
};

/**
 * 平台ID
 */
export const PLATFORMS = {
    CZBK: 'czbk',                            // 传智播客
    CHAOXING: 'chaoxing',                    // 超星学习通
    UNKNOWN: 'unknown'                       // 未知平台
};

/**
 * 平台名称
 */
export const PLATFORM_NAMES = {
    [PLATFORMS.CZBK]: '传智播客',
    [PLATFORMS.CHAOXING]: '超星学习通',
    [PLATFORMS.UNKNOWN]: '未知平台'
};

/**
 * API端点
 */
export const API_ENDPOINTS = {
    SEARCH: '/api/search',
    BATCH_SEARCH: '/api/search/batch',
    AI_ANSWER: '/api/ai/answer',
    UPLOAD: '/api/upload',
    KEY_INFO: '/api/key/info',
    MODELS: '/api/models',
    ERROR_REPORT: '/api/error/report'
};

/**
 * 请求状态
 */
export const REQUEST_STATUS = {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
    TIMEOUT: 'timeout'
};

/**
 * 缓存配置
 */
export const CACHE_CONFIG = {
    DOM_TTL: 5000,                           // DOM缓存TTL (5秒)
    API_TTL: 300000,                         // API缓存TTL (5分钟)
    MAX_SIZE: 500                            // 最大缓存数量
};

/**
 * 延迟配置
 */
export const DELAY_CONFIG = {
    ANSWER_FILL: 500,                        // 填充答案延迟
    CLICK: 100,                              // 点击延迟
    SUBMIT: 2000,                            // 提交延迟
    RETRY: 1000                              // 重试延迟
};

/**
 * 事件名称
 */
export const EVENTS = {
    ANSWER_FILLED: 'answer:filled',
    QUESTION_ANSWERED: 'question:answered',
    SUBMIT_SUCCESS: 'submit:success',
    SUBMIT_FAILED: 'submit:failed',
    ERROR_OCCURRED: 'error:occurred',
    CORRECTION_STARTED: 'correction:started',
    CORRECTION_COMPLETED: 'correction:completed'
};

/**
 * 纠错策略
 */
export const CORRECTION_STRATEGIES = {
    ELIMINATION: 'elimination',               // 排除法
    AI_ASSISTED: 'ai_assisted_elimination',  // AI辅助排除法
    TOGGLE: 'toggle',                        // 切换 (判断题)
    AI_CORRECTION: 'ai_correction'           // AI纠错
};

/**
 * 日志级别
 */
export const LOG_LEVELS = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
};

/**
 * UI主题
 */
export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    AUTO: 'auto'
};

/**
 * 版本信息
 */
export const VERSION = {
    MAJOR: 2,
    MINOR: 0,
    PATCH: 0,
    SUFFIX: 'alpha.1',
    toString() {
        return `${this.MAJOR}.${this.MINOR}.${this.PATCH}-${this.SUFFIX}`;
    }
};

/**
 * 构建信息
 */
export const BUILD_INFO = {
    DATE: new Date().toISOString(),
    ENV: process.env.NODE_ENV || 'development'
};
