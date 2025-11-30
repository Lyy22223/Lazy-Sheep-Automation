/**
 * 懒羊羊自动化平台 - 通用工具函数集合
 * @author 懒羊羊
 */

import { REGEX_PATTERNS, LOG_LEVELS } from './constants.js';

/**
 * 睡眠函数
 * @param {number} ms - 毫秒数
 * @returns {Promise}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 日志输出 (带级别)
 * @param {string} level - 日志级别
 * @param  {...any} args - 日志内容
 */
export function log(level, ...args) {
    const prefix = `[CZBK ${level.toUpperCase()}]`;
    const timestamp = new Date().toLocaleTimeString();

    switch (level) {
        case LOG_LEVELS.DEBUG:
            console.debug(prefix, timestamp, ...args);
            break;
        case LOG_LEVELS.INFO:
            console.log(prefix, timestamp, ...args);
            break;
        case LOG_LEVELS.WARN:
            console.warn(prefix, timestamp, ...args);
            break;
        case LOG_LEVELS.ERROR:
            console.error(prefix, timestamp, ...args);
            break;
        default:
            console.log(prefix, timestamp, ...args);
            
    }
}

/**
 * 简化的日志函数
 */
export const logger = {
    debug: (...args) => log(LOG_LEVELS.DEBUG, ...args),
    info: (...args) => log(LOG_LEVELS.INFO, ...args),
    warn: (...args) => log(LOG_LEVELS.WARN, ...args),
    error: (...args) => log(LOG_LEVELS.ERROR, ...args)
};

/**
 * HTML转义
 * @param {string} html - HTML字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

/**
 * 移除HTML标签
 * @param {string} html - HTML字符串
 * @returns {string} 纯文本
 */
export function stripHtml(html) {
    return html.replace(REGEX_PATTERNS.HTML_TAG, '');
}

/**
 * 规范化空白字符
 * @param {string} text - 文本
 * @returns {string} 规范化后的文本
 */
export function normalizeWhitespace(text) {
    return text.replace(REGEX_PATTERNS.WHITESPACE, ' ').trim();
}

/**
 * 生成哈希ID
 * @param {string} text - 输入文本
 * @returns {string} 哈希ID
 */
export function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * 深拷贝对象
 * @param {*} obj - 要拷贝的对象
 * @returns {*} 拷贝后的对象
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }

    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制(毫秒)
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 重试函数
 * @param {Function} fn - 要重试的异步函数
 * @param {number} retries - 重试次数
 * @param {number} delay - 重试延迟(毫秒)
 * @returns {Promise} 函数执行结果
 */
export async function retry(fn, retries = 3, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }
        logger.warn(`函数执行失败,${delay}ms后重试,剩余${retries}次`);
        await sleep(delay);
        return retry(fn, retries - 1, delay);
    }
}

/**
 * 并发控制
 * @param {Array} tasks - 任务数组
 * @param {number} limit - 并发限制
 * @returns {Promise<Array>} 所有任务结果
 */
export async function concurrentLimit(tasks, limit = 3) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p);

        if (limit <= tasks.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);

            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }

    return Promise.all(results);
}

/**
 * 格式化时间
 * @param {number} timestamp - 时间戳(毫秒)
 * @returns {string} 格式化的时间字符串
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 下载JSON文件
 * @param {object} data - 要下载的数据
 * @param {string} filename - 文件名
 */
export function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)],
        { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 读取JSON文件
 * @returns {Promise<object>} 文件内容
 */
export function uploadJSON() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                reject(new Error('未选择文件'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        };

        input.click();
    });
}

/**
 * 检查是否为移动端
 * @returns {boolean}
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);
}

/**
 * 检查是否为特定浏览器
 * @param {string} browser - 浏览器名称
 * @returns {boolean}
 */
export function isBrowser(browser) {
    const ua = navigator.userAgent.toLowerCase();
    return ua.indexOf(browser.toLowerCase()) > -1;
}

/**
 * 获取URL参数
 * @param {string} name - 参数名
 * @returns {string|null} 参数值
 */
export function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

/**
 * 设置URL参数
 * @param {string} name - 参数名
 * @param {string} value - 参数值
 */
export function setUrlParam(name, value) {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.pushState({}, '', url);
}

/**
 * 复制到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
}
