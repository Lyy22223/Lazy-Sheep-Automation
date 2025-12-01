/**
 * 懒羊羊自动化平台 - 错题跟踪管理器
 * @author 懒羊羊
 * @description 管理纠错过程中的错题数据
 */

import { logger } from './utils.js';

class ErrorQuestionTracker {
    constructor() {
        this.errors = new Map(); // questionId => errorData
        this.listeners = new Set(); // 监听器集合
        this.loadFromStorage();
    }

    /**
     * 添加/更新错题
     * @param {object} questionData - 题目数据
     */
    add(questionData) {
        const {
            questionId,
            questionType,
            content,
            options,
            wrongAnswer,
            attemptedAnswers = [],
            status = 'pending', // pending | retrying | success | failed
            attemptCount = 0
        } = questionData;

        const errorData = {
            questionId,
            questionType,
            content: content?.substring(0, 100) || '', // 截取前100字符
            options: options || [],
            wrongAnswer,
            attemptedAnswers: [...attemptedAnswers],
            status,
            attemptCount,
            lastAttemptTime: new Date().toISOString(),
            addedTime: this.errors.has(questionId) 
                ? this.errors.get(questionId).addedTime 
                : new Date().toISOString()
        };

        this.errors.set(questionId, errorData);
        this.saveToStorage();
        this.notify();
        
        logger.debug(`[ErrorTracker] 更新错题: ${questionId}, 状态: ${status}`);
    }

    /**
     * 更新题目状态
     * @param {string} questionId - 题目ID
     * @param {string} status - 新状态
     * @param {string} answer - 答案（可选）
     */
    updateStatus(questionId, status, answer = null) {
        const error = this.errors.get(questionId);
        if (!error) return;

        error.status = status;
        error.lastAttemptTime = new Date().toISOString();
        
        if (answer) {
            if (!error.attemptedAnswers.includes(answer)) {
                error.attemptedAnswers.push(answer);
            }
            error.attemptCount = error.attemptedAnswers.length;
        }

        this.errors.set(questionId, error);
        this.saveToStorage();
        this.notify();
    }

    /**
     * 批量添加错题
     * @param {Array} questions - 题目列表
     */
    addBatch(questions) {
        questions.forEach(q => this.add(q));
    }

    /**
     * 获取所有错题
     * @param {string} statusFilter - 状态过滤（可选）
     * @returns {Array} 错题列表
     */
    getAll(statusFilter = null) {
        const errors = Array.from(this.errors.values());
        
        if (statusFilter) {
            return errors.filter(e => e.status === statusFilter);
        }
        
        return errors.sort((a, b) => 
            new Date(b.lastAttemptTime) - new Date(a.lastAttemptTime)
        );
    }

    /**
     * 获取单个错题
     * @param {string} questionId - 题目ID
     * @returns {object|null} 错题数据
     */
    get(questionId) {
        return this.errors.get(questionId) || null;
    }

    /**
     * 删除错题
     * @param {string} questionId - 题目ID
     */
    remove(questionId) {
        this.errors.delete(questionId);
        this.saveToStorage();
        this.notify();
    }

    /**
     * 清空所有错题
     */
    clear() {
        this.errors.clear();
        this.saveToStorage();
        this.notify();
        logger.info('[ErrorTracker] 已清空所有错题');
    }

    /**
     * 获取统计信息
     * @returns {object} 统计数据
     */
    getStats() {
        const all = this.getAll();
        return {
            total: all.length,
            pending: all.filter(e => e.status === 'pending').length,
            retrying: all.filter(e => e.status === 'retrying').length,
            success: all.filter(e => e.status === 'success').length,
            failed: all.filter(e => e.status === 'failed').length,
            byType: this._groupByType(all)
        };
    }

    /**
     * 按题型分组
     * @private
     */
    _groupByType(errors) {
        const typeNames = {
            '0': '单选题',
            '1': '多选题',
            '2': '判断题',
            '3': '填空题',
            '4': '简答题'
        };

        const grouped = {};
        errors.forEach(e => {
            const typeName = typeNames[e.questionType] || '未知';
            if (!grouped[typeName]) {
                grouped[typeName] = 0;
            }
            grouped[typeName]++;
        });

        return grouped;
    }

    /**
     * 添加监听器
     * @param {Function} callback - 回调函数
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * 移除监听器
     * @param {Function} callback - 回调函数
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * 通知所有监听器
     * @private
     */
    notify() {
        const stats = this.getStats();
        this.listeners.forEach(callback => {
            try {
                callback(stats, this.getAll());
            } catch (error) {
                logger.error('[ErrorTracker] 监听器执行失败:', error);
            }
        });
    }

    /**
     * 保存到LocalStorage
     * @private
     */
    saveToStorage() {
        try {
            const data = {
                errors: Array.from(this.errors.entries()),
                savedAt: new Date().toISOString()
            };
            localStorage.setItem('czbk_error_questions', JSON.stringify(data));
        } catch (error) {
            logger.warn('[ErrorTracker] 保存到LocalStorage失败:', error);
        }
    }

    /**
     * 从LocalStorage加载
     * @private
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('czbk_error_questions');
            if (!stored) return;

            const data = JSON.parse(stored);
            const savedAt = new Date(data.savedAt);
            const now = new Date();
            const daysDiff = (now - savedAt) / (1000 * 60 * 60 * 24);

            // 只加载7天内的数据
            if (daysDiff > 7) {
                localStorage.removeItem('czbk_error_questions');
                logger.info('[ErrorTracker] 已清理过期错题数据');
                return;
            }

            this.errors = new Map(data.errors);
            logger.info(`[ErrorTracker] 从LocalStorage加载了 ${this.errors.size} 道错题`);
        } catch (error) {
            logger.warn('[ErrorTracker] 从LocalStorage加载失败:', error);
        }
    }
}

// 导出单例
export default new ErrorQuestionTracker();
