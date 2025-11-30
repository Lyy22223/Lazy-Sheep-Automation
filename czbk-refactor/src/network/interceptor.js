/**
 * 懒羊羊自动化平台 - 网络拦截器
 * @author 懒羊羊
 * @description 拦截平台的网络请求，用于智能纠错
 * 
 * 实际测试发现:
 * - 批改结果通过网络响应返回
 * - 可以从submit-event事件获取提交数据
 * - 错题信息包含在返回的JSON中
 */

import { logger } from '../core/utils.js';
import { EVENTS } from '../core/constants.js';

class NetworkInterceptor {
    constructor() {
        this.enabled = false;
        this.interceptedRequests = [];
        this.listeners = new Map();
        this.originalFetch = null;
        this.originalXHR = null;
    }

    /**
     * 启动拦截器
     */
    start() {
        if (this.enabled) {
            logger.warn('[Interceptor] 拦截器已启动');
            return;
        }

        this._interceptFetch();
        this._interceptXHR();
        this._interceptVueEvents();

        this.enabled = true;
        logger.info('[Interceptor] 网络拦截器已启动');
    }

    /**
     * 停止拦截器
     */
    stop() {
        if (!this.enabled) return;

        // 恢复原始fetch
        if (this.originalFetch) {
            window.fetch = this.originalFetch;
        }

        // 恢复原始XMLHttpRequest
        if (this.originalXHR) {
            window.XMLHttpRequest = this.originalXHR;
        }

        this.enabled = false;
        logger.info('[Interceptor] 网络拦截器已停止');
    }

    /**
     * 拦截Fetch API
     * @private
     */
    _interceptFetch() {
        this.originalFetch = window.fetch;

        window.fetch = async (...args) => {
            const [url, options] = args;

            // 执行原始请求
            const response = await this.originalFetch(...args);

            // 检查是否为关键接口
            if (this._isImportantRequest(url)) {
                // 克隆响应以便读取
                const clonedResponse = response.clone();

                try {
                    const data = await clonedResponse.json();
                    this._handleResponse(url, data, options);
                } catch (error) {
                    // 忽略非JSON响应
                }
            }

            return response;
        };
    }

    /**
     * 拦截XMLHttpRequest
     * @private
     */
    _interceptXHR() {
        this.originalXHR = window.XMLHttpRequest;
        const self = this;

        window.XMLHttpRequest = function () {
            const xhr = new self.originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;

            let requestUrl = '';
            let requestBody = null;

            // 拦截open
            xhr.open = function (method, url, ...rest) {
                requestUrl = url;
                return originalOpen.call(this, method, url, ...rest);
            };

            // 拦截send
            xhr.send = function (body) {
                requestBody = body;

                // 监听响应
                xhr.addEventListener('load', function () {
                    if (self._isImportantRequest(requestUrl)) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            self._handleResponse(requestUrl, data, { body: requestBody });
                        } catch (error) {
                            // 忽略非JSON响应
                        }
                    }
                });

                return originalSend.call(this, body);
            };

            return xhr;
        };

        // 复制静态属性
        Object.setPrototypeOf(window.XMLHttpRequest, this.originalXHR);
        window.XMLHttpRequest.prototype = this.originalXHR.prototype;
    }

    /**
     * 拦截Vue事件
     * @private
     */
    _interceptVueEvents() {
        // 监听submit-event (答案提交事件)
        document.addEventListener('submit-event', (event) => {
            logger.debug('[Interceptor] 捕获submit-event:', event.detail);
            this._emit('submit', event.detail);
        });
    }

    /**
     * 检查是否为重要请求
     * @private
     */
    _isImportantRequest(url) {
        const importantPatterns = [
            '/submitStudentBusywork',  // 提交作业
            '/updateStudentAns',       // 更新答案
            '/valiBusywork',           // 验证作业
            '/findStudentBusywork'     // 查找作业
        ];

        return importantPatterns.some(pattern => url.includes(pattern));
    }

    /**
     * 处理响应数据
     * @private
     */
    _handleResponse(url, data, requestOptions) {
        logger.debug('[Interceptor] 拦截响应:', url);

        // 提交结果
        if (url.includes('/submitStudentBusywork')) {
            this._handleSubmitResponse(data);
        }

        // 保存答案结果
        if (url.includes('/updateStudentAns')) {
            this._handleSaveResponse(data);
        }

        // 记录请求
        this.interceptedRequests.push({
            url,
            data,
            timestamp: Date.now()
        });

        // 只保留最近100条
        if (this.interceptedRequests.length > 100) {
            this.interceptedRequests.shift();
        }
    }

    /**
     * 处理提交响应
     * @private
     */
    _handleSubmitResponse(data) {
        logger.info('[Interceptor] 提交结果:', data);

        // 触发提交成功事件
        this._emit('submit-success', data);

        // 检查是否有错题
        if (data.errorQuestions && data.errorQuestions.length > 0) {
            logger.warn(`[Interceptor] 发现 ${data.errorQuestions.length} 道错题`);
            this._emit('errors-found', data.errorQuestions);
        }
    }

    /**
     * 处理保存响应
     * @private
     */
    _handleSaveResponse(data) {
        logger.debug('[Interceptor] 保存结果:', data);
        this._emit('answer-saved', data);
    }

    /**
     * 注册事件监听器
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * 移除事件监听器
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * 触发事件
     * @private
     */
    _emit(event, data) {
        if (!this.listeners.has(event)) return;

        for (const callback of this.listeners.get(event)) {
            try {
                callback(data);
            } catch (error) {
                logger.error(`[Interceptor] 事件处理失败 ${event}:`, error);
            }
        }
    }

    /**
     * 获取拦截记录
     * @param {number} limit - 返回数量限制
     * @returns {Array} 拦截记录
     */
    getRecords(limit = 10) {
        return this.interceptedRequests.slice(-limit);
    }

    /**
     * 清空记录
     */
    clearRecords() {
        this.interceptedRequests = [];
    }
}

// 导出单例
export default new NetworkInterceptor();
