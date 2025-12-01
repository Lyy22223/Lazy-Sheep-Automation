/**
 * 懒羊羊自动化平台 - 请求队列管理器
 * @author 懒羊羊
 * @description 控制并发请求数量，避免服务器压力过大
 */

import { logger } from '../core/utils.js';

class RequestQueue {
    constructor(concurrencyLimit = 3) {
        this.concurrencyLimit = concurrencyLimit;
        this.runningCount = 0;
        this.queue = [];
        this.results = new Map();
    }

    /**
     * 添加任务到队列
     * @param {Function} task - 异步任务函数
     * @param {string} id - 任务ID（可选）
     * @returns {Promise} 任务结果
     */
    add(task, id = null) {
        return new Promise((resolve, reject) => {
            const item = {
                task,
                id,
                resolve,
                reject,
                status: 'pending'
            };

            this.queue.push(item);
            this._processQueue();
        });
    }

    /**
     * 批量添加任务
     * @param {Array<Function>} tasks - 任务数组
     * @returns {Promise<Array>} 所有任务结果
     */
    async addBatch(tasks) {
        const promises = tasks.map((task, index) =>
            this.add(task, `batch-${index}`)
        );
        return await Promise.all(promises);
    }

    /**
     * 处理队列
     * @private
     */
    async _processQueue() {
        // 检查是否可以执行新任务
        if (this.runningCount >= this.concurrencyLimit || this.queue.length === 0) {
            return;
        }

        // 从队列中取出任务
        const item = this.queue.shift();
        if (!item) return;

        this.runningCount++;
        item.status = 'running';

        logger.debug(`[Queue] 执行任务 ${item.id || 'anonymous'}, 当前并发: ${this.runningCount}`);

        try {
            // 执行任务
            const result = await item.task();

            item.status = 'success';
            if (item.id) {
                this.results.set(item.id, result);
            }

            item.resolve(result);
        } catch (error) {
            item.status = 'failed';
            logger.error(`[Queue] 任务失败 ${item.id}:`, error);
            item.reject(error);
        } finally {
            this.runningCount--;

            // 继续处理队列中的下一个任务
            this._processQueue();
        }
    }

    /**
     * 设置并发限制
     * @param {number} limit - 并发数量
     */
    setConcurrencyLimit(limit) {
        this.concurrencyLimit = limit;
        logger.info(`[Queue] 并发限制设置为: ${limit}`);
    }

    /**
     * 获取队列状态
     * @returns {object} 状态信息
     */
    getStatus() {
        return {
            running: this.runningCount,
            pending: this.queue.length,
            limit: this.concurrencyLimit,
            total: this.runningCount + this.queue.length
        };
    }

    /**
     * 清空队列
     */
    clear() {
        // 拒绝所有pending任务
        for (const item of this.queue) {
            item.reject(new Error('队列已清空'));
        }

        this.queue = [];
        this.results.clear();
        logger.info('[Queue] 队列已清空');
    }

    /**
     * 等待所有任务完成
     * @returns {Promise} 完成Promise
     */
    async waitAll() {
        while (this.runningCount > 0 || this.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        logger.info('[Queue] 所有任务已完成');
    }
}

// 导出单例（默认3个并发）
export default new RequestQueue(3);
