/**
 * 懒羊羊自动化平台 - DOM缓存管理器
 * @author 懒羊羊
 * @description 提供高性能的DOM查询缓存功能
 */

import { CACHE_CONFIG } from './constants.js';

class DOMCache {
    constructor() {
        this._cache = new Map();
        this._timestamp = new Map();
        this.TTL = CACHE_CONFIG.DOM_TTL;
        this.maxSize = CACHE_CONFIG.MAX_SIZE;

        // 定期清理过期缓存
        this._startCleanupTimer();
    }

    /**
     * 查询单个元素 (带缓存)
     * @param {string} selector - CSS选择器
     * @param {Element} context - 上下文元素,默认为 document
     * @param {boolean} useCache - 是否使用缓存
     * @returns {Element|null}
     */
    query(selector, context = document, useCache = true) {
        const key = this._getCacheKey(selector, context);

        if (useCache) {
            const cached = this._getFromCache(key);
            if (cached !== null) {
                return cached;
            }
        }

        const result = context.querySelector(selector);

        if (result && useCache) {
            this._setToCache(key, result);
        }

        return result;
    }

    /**
     * 查询多个元素 (带缓存)
     * @param {string} selector - CSS选择器
     * @param {Element} context - 上下文元素
     * @param {boolean} useCache - 是否使用缓存
     * @returns {Array<Element>}
     */
    queryAll(selector, context = document, useCache = true) {
        const key = this._getCacheKey(selector + '::all', context);

        if (useCache) {
            const cached = this._getFromCache(key);
            if (cached !== null) {
                return cached;
            }
        }

        const result = Array.from(context.querySelectorAll(selector));

        if (result.length > 0 && useCache) {
            this._setToCache(key, result);
        }

        return result;
    }

    /**
     * 生成缓存键
     * @private
     */
    _getCacheKey(selector, context) {
        const contextId = context === document ? 'doc' : (context.id || 'ctx');
        return `${selector}::${contextId}`;
    }

    /**
     * 从缓存获取
     * @private
     */
    _getFromCache(key) {
        const cached = this._cache.get(key);
        const timestamp = this._timestamp.get(key);

        if (cached && timestamp && Date.now() - timestamp < this.TTL) {
            return cached;
        }

        // 缓存过期,删除
        if (cached) {
            this._cache.delete(key);
            this._timestamp.delete(key);
        }

        return null;
    }

    /**
     * 设置到缓存
     * @private
     */
    _setToCache(key, value) {
        // 检查缓存大小,超过限制则清理
        if (this._cache.size >= this.maxSize) {
            this._cleanOldest();
        }

        this._cache.set(key, value);
        this._timestamp.set(key, Date.now());
    }

    /**
     * 清理最旧的缓存项
     * @private
     */
    _cleanOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, time] of this._timestamp.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this._cache.delete(oldestKey);
            this._timestamp.delete(oldestKey);
        }
    }

    /**
     * 清理过期缓存
     */
    cleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, time] of this._timestamp.entries()) {
            if (now - time > this.TTL) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this._cache.delete(key);
            this._timestamp.delete(key);
        }

        return expiredKeys.length;
    }

    /**
     * 清空所有缓存
     */
    clear() {
        this._cache.clear();
        this._timestamp.clear();
    }

    /**
     * 获取缓存统计信息
     * @returns {object}
     */
    getStats() {
        return {
            size: this._cache.size,
            maxSize: this.maxSize,
            ttl: this.TTL
        };
    }

    /**
     * 启动自动清理定时器
     * @private
     */
    _startCleanupTimer() {
        // 每10秒清理一次过期缓存
        setInterval(() => {
            const cleaned = this.cleanup();
            if (cleaned > 0) {
                console.debug(`[DOMCache] 清理了 ${cleaned} 个过期缓存项`);
            }
        }, 10000);
    }
}

// 导出单例
export default new DOMCache();
