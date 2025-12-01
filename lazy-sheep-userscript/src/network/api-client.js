/**
 * 懒羊羊自动化平台 - API客户端
 * @author 懒羊羊
 * @description 统一的API请求接口，支持去重、重试、超时控制
 * 
 * 实际测试发现:
 * - Content-Type: application/x-www-form-urlencoded (不是JSON)
 * - URL路径有 /back/ 前缀
 * - 需要 login-name 请求头
 */

import Config from '../core/config.js';
import { logger, retry } from '../core/utils.js';
import { API_ENDPOINTS, REQUEST_STATUS } from '../core/constants.js';

class APIClient {
    constructor() {
        this.baseUrl = Config.get('api.baseUrl');
        this.timeout = Config.get('api.timeout', 90000);
        this.pendingRequests = new Map();
    }

    /**
     * 搜索题目答案
     * @param {string} questionId - 题目ID
     * @param {string} questionText - 题目内容
     * @returns {Promise<object>} 响应数据
     */
    async search(questionId, questionText, questionType = '0') {
        const url = `${this.baseUrl}${API_ENDPOINTS.SEARCH}`;

        const data = {
            questionId,
            questionContent: questionText,
            type: questionType,
            platform: 'czbk'
        };

        try {
            const response = await this._request({
                url,
                method: 'POST',
                data,
                useCache: true
            });

            logger.debug('[API] 搜索成功:', questionId);
            return response.data || response;
        } catch (error) {
            logger.error('[API] 搜索失败:', error);
            throw error;
        }
    }

    /**
     * 批量搜索题目答案
     * @param {Array<object>} questions - 题目列表 [{id, text}, ...]
     * @returns {Promise<Array>} 响应数组
     */
    async batchSearch(questions) {
        const url = `${this.baseUrl}${API_ENDPOINTS.BATCH_SEARCH}`;

        const data = {
            questions: questions.map(q => ({
                questionId: q.id,
                questionContent: q.text,
                type: q.type || '0'
            })),
            platform: 'czbk'
        };

        try {
            const response = await this._request({
                url,
                method: 'POST',
                data
            });

            logger.info(`[API] 批量搜索成功: ${questions.length}道题目`);
            return response.results || [];
        } catch (error) {
            logger.error('[API] 批量搜索失败:', error);
            return [];
        }
    }

    /**
     * AI答题
     * @param {string} questionText - 题目内容
     * @param {string} questionType - 题型
     * @param {Array<string>} options - 选项列表（可选）
     * @param {Array<string>} attemptedAnswers - 已尝试的错误答案（可选）
     * @returns {Promise<string>} AI答案
     */
    async aiAnswer(questionText, questionType, options = [], attemptedAnswers = null) {
        const url = `${this.baseUrl}${API_ENDPOINTS.AI_ANSWER}`;

        const data = {
            questionContent: questionText,
            type: questionType,
            options,
            platform: 'czbk',
            model: Config.get('ai.model', 'deepseek-chat')
        };
        
        // 添加已尝试的答案（用于纠错）
        if (attemptedAnswers && attemptedAnswers.length > 0) {
            data.attemptedAnswers = attemptedAnswers;
        }

        try {
            const response = await this._request({
                url,
                method: 'POST',
                data,
                timeout: Config.get('ai.timeout', 90000)
            });

            logger.info('[API] AI答题成功');
            return response.data?.answer || response.answer || '';
        } catch (error) {
            logger.error('[API] AI答题失败:', error);
            throw error;
        }
    }

    /**
     * 上传题目和答案
     * @param {object} question - 题目数据
     * @returns {Promise<boolean>} 是否成功
     */
    async upload(question) {
        const url = `${this.baseUrl}${API_ENDPOINTS.UPLOAD}`;

        try {
            // 输出上传数据供调试
            logger.debug('[API] 上传数据:', JSON.stringify({
                questionId: question.questionId,
                type: question.type,
                answer: question.answer,
                options: question.options
            }));
            
            await this._request({
                url,
                method: 'POST',
                data: question
            });

            logger.debug('[API] 上传成功');
            return true;
        } catch (error) {
            logger.error('[API] 上传失败:', error);
            logger.error('[API] 失败数据:', JSON.stringify(question));
            return false;
        }
    }

    /**
     * 获取API Key信息
     * @returns {Promise<object>} API Key信息
     */
    async getKeyInfo() {
        const url = `${this.baseUrl}${API_ENDPOINTS.KEY_INFO}`;

        try {
            const response = await this._request({
                url,
                method: 'GET'
            });

            return response;
        } catch (error) {
            logger.error('[API] 获取Key信息失败:', error);
            return null;
        }
    }

    /**
     * 统一请求方法
     * @private
     */
    async _request(options) {
        const {
            url,
            method = 'POST',
            data = null,
            timeout = this.timeout,
            useCache = false
        } = options;

        // 生成缓存键
        const cacheKey = useCache ? this._getCacheKey(url, data) : null;

        // 检查去重
        if (cacheKey && this.pendingRequests.has(cacheKey)) {
            logger.debug('[API] 使用已存在的请求');
            return await this.pendingRequests.get(cacheKey);
        }

        // 创建请求Promise
        const requestPromise = this._doRequest(url, method, data, timeout);

        // 存储到pending（请求去重）
        if (cacheKey) {
            this.pendingRequests.set(cacheKey, requestPromise);

            // 请求完成后清理
            requestPromise.finally(() => {
                this.pendingRequests.delete(cacheKey);
            });
        }

        return await requestPromise;
    }

    /**
     * 执行实际请求
     * @private
     */
    async _doRequest(url, method, data, timeout) {
        return new Promise((resolve, reject) => {
            // 构建请求头
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // 添加API Key（如果存在）
            const apiKey = Config.get('api.key');
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }
            
            const requestOptions = {
                method,
                url,
                timeout,
                headers,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result);
                        } catch (error) {
                            reject(new Error('响应解析失败'));
                        }
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: (error) => {
                    reject(new Error('网络请求失败'));
                },
                ontimeout: () => {
                    reject(new Error('请求超时'));
                }
            };

            // 添加请求体
            if (data && (method === 'POST' || method === 'PUT')) {
                requestOptions.data = JSON.stringify(data);
            }

            // 使用GM_xmlhttpRequest发送请求
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest(requestOptions);
            } else {
                reject(new Error('GM_xmlhttpRequest不可用'));
            }
        });
    }

    /**
     * 生成缓存键
     * @private
     */
    _getCacheKey(url, data) {
        const dataStr = data ? JSON.stringify(data) : '';
        return `${url}::${dataStr}`;
    }

    /**
     * 清理所有pending请求
     */
    clearPending() {
        this.pendingRequests.clear();
    }
}

// 导出单例
export default new APIClient();
