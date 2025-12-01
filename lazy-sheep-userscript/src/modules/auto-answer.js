/**
 * 懒羊羊自动化平台 - 自动答题模块
 * @author 懒羊羊
 * @description 完整的自动答题流程控制
 */

import { logger, sleep } from '../core/utils.js';
import { DELAY_CONFIG, QUESTION_TYPES } from '../core/constants.js';
import PlatformManager from '../platforms/manager.js';
import APIClient from '../network/api-client.js';
import DataTransformer from '../network/data-transformer.js';
import RequestQueue from '../network/request-queue.js';
import AnswerFiller from './answer-filler.js';

class AutoAnswer {
    constructor() {
        this.running = false;
        this.paused = false;
        this.progress = {
            total: 0,
            answered: 0,
            success: 0,
            failed: 0,
            skipped: 0
        };
        this.results = [];
    }

    /**
     * 开始自动答题
     * @param {object} options - 配置选项
     * @returns {Promise<object>} 答题结果
     */
    async start(options = {}) {
        if (this.running) {
            logger.warn('[AutoAnswer] 已经在运行中');
            return null;
        }

        try {
            this.running = true;
            this.paused = false;
            this.resetProgress();

            logger.info('[AutoAnswer] 🚀 开始自动答题');

            // 获取平台适配器
            const platform = PlatformManager.getCurrentAdapter();
            if (!platform) {
                throw new Error('未检测到支持的平台');
            }

            // 提取所有题目
            const questions = options.questions || platform.extractAllQuestions();
            this.progress.total = questions.length;

            logger.info(`[AutoAnswer] 共 ${questions.length} 道题目`);

            if (questions.length === 0) {
                logger.warn('[AutoAnswer] 没有找到题目');
                return this.getResult();
            }

            // 过滤已答题目（可选）
            const unansweredQuestions = options.skipAnswered
                ? questions.filter(q => !this._isAnswered(q.element))
                : questions;

            logger.info(`[AutoAnswer] 需要答题: ${unansweredQuestions.length} 道`);

            // 批量答题
            await this._answerQuestions(unansweredQuestions, options);

            logger.info('[AutoAnswer] ✅ 答题完成');

            return this.getResult();

        } catch (error) {
            logger.error('[AutoAnswer] 答题失败:', error);
            throw error;
        } finally {
            this.running = false;
        }
    }

    /**
     * 批量答题
     * @private
     */
    async _answerQuestions(questions, options) {
        const {
            useQueue = true,
            batchSize = 10,
            delay = DELAY_CONFIG.ANSWER_FILL,
            onProgress = null
        } = options;

        if (useQueue) {
            // 使用队列控制并发
            let index = 0;
            for (const question of questions) {
                if (!this.running || this.paused) break;

                const currentIndex = index++;
                await RequestQueue.add(async () => {
                    await this._answerSingleQuestion(question, {
                        ...options,
                        index: currentIndex,
                        total: questions.length
                    });
                });

                await sleep(delay);
            }

            // 等待所有任务完成
            await RequestQueue.waitAll();
        } else {
            // 批量处理
            for (let i = 0; i < questions.length; i += batchSize) {
                if (!this.running || this.paused) break;

                const batch = questions.slice(i, i + batchSize);
                await Promise.all(
                    batch.map(q => this._answerSingleQuestion(q, options))
                );

                await sleep(delay * batchSize);
            }
        }
    }

    /**
     * 答单个题目
     * @private
     */
    async _answerSingleQuestion(question, options) {
        const { element, id, content, type } = question;
        const { onProgress, index, total } = options;

        try {
            // 通知开始答题
            if (onProgress) {
                onProgress({
                    type: 'start',
                    current: index + 1,
                    total: total,
                    questionId: id,
                    questionContent: content?.substring(0, 50)
                });
            }

            logger.debug(`[AutoAnswer] 开始答题: ${id}`);

            // 滚动到当前题目
            if (element && typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }

            // 1. 查询答案
            let answer = null;

            // 优先使用云端API
            try {
                const response = await APIClient.search(id, content, type);
                if (response && response.answer) {
                    answer = response.answer;
                    logger.debug(`[AutoAnswer] 云端查询成功: ${answer}`);
                }
            } catch (error) {
                logger.warn('[AutoAnswer] 云端查询失败:', error);
            }

            // 降级使用AI
            if (!answer && options.useAI) {
                try {
                    answer = await APIClient.aiAnswer(
                        content,
                        type,
                        question.options || []
                    );
                    logger.debug(`[AutoAnswer] AI答题成功: ${answer}`);
                } catch (error) {
                    logger.warn('[AutoAnswer] AI答题失败:', error);
                }
            }

            if (!answer) {
                logger.warn(`[AutoAnswer] 未找到答案: ${id}`);
                this.progress.skipped++;
                this.results.push({
                    questionId: id,
                    status: 'skipped',
                    reason: '未找到答案'
                });
                
                // 通知跳过
                if (onProgress) {
                    onProgress({
                        type: 'skip',
                        current: index + 1,
                        total: total,
                        questionId: id,
                        reason: '未找到答案',
                        progress: {
                            answered: this.progress.answered,
                            success: this.progress.success,
                            failed: this.progress.failed,
                            skipped: this.progress.skipped
                        }
                    });
                }
                
                return;
            }

            // 2. 填充答案
            const filled = await AnswerFiller.fill(element, answer, type);

            if (filled) {
                this.progress.success++;
                this.progress.answered++;
                
                // 检查多选题答案是否可疑
                const warning = this._checkMultipleChoiceAnswer(type, answer);

                this.results.push({
                    questionId: id,
                    status: 'success',
                    answer,
                    warning: warning || undefined
                });

                logger.info(`[AutoAnswer] ✓ 答题成功 (${this.progress.answered}/${this.progress.total})`);
                
                // 通知答题成功
                if (onProgress) {
                    onProgress({
                        type: 'success',
                        current: index + 1,
                        total: total,
                        questionId: id,
                        answer: answer,
                        progress: {
                            answered: this.progress.answered,
                            success: this.progress.success,
                            failed: this.progress.failed,
                            skipped: this.progress.skipped
                        }
                    });
                }
                
                if (warning) {
                    logger.warn(`[AutoAnswer] ${warning}`);
                }

                // 3. 上传答案到数据库（异步，不阻塞答题）
                this._uploadAnswer(question, answer).catch(error => {
                    logger.warn('[AutoAnswer] 上传答案失败（不影响答题）:', error);
                });
            } else {
                this.progress.failed++;

                this.results.push({
                    questionId: id,
                    status: 'failed',
                    reason: '填充失败'
                });

                logger.error(`[AutoAnswer] ✗ 填充失败: ${id}`);
            }

        } catch (error) {
            this.progress.failed++;

            this.results.push({
                questionId: id,
                status: 'error',
                error: error.message
            });

            logger.error(`[AutoAnswer] 答题异常: ${id}`, error);
        }
    }

    /**
     * 上传答案到数据库
     * @private
     */
    async _uploadAnswer(question, answer) {
        try {
            const { id, content, type, options } = question;

            // 使用数据转换器标准化数据
            const platformData = {
                questionId: id,
                questionContent: content,
                questionType: type,
                options: options,
                answer: answer
            };

            // 转换为数据库格式
            const uploadData = DataTransformer.platformToDatabase(platformData);
            
            if (!uploadData) {
                throw new Error('数据格式转换失败');
            }

            // 设置额外信息
            uploadData.confidence = 1.0; // 用户确认的答案，置信度最高
            uploadData.source = 'auto_answer'; // 来源：自动答题

            // 验证数据完整性
            if (!DataTransformer.validateDatabaseFormat(uploadData)) {
                throw new Error('数据格式验证失败');
            }

            // 清理数据
            const cleanData = DataTransformer.cleanData(uploadData);

            logger.debug(`[AutoAnswer] 上传数据:`, cleanData);

            // 发送上传请求（异步，不阻塞）
            const success = await APIClient.upload(cleanData);
            
            if (success) {
                logger.debug(`[AutoAnswer] 答案已上传: ${id}`);
            }

            return success;
        } catch (error) {
            // 上传失败不影响答题流程
            logger.debug('[AutoAnswer] 上传异常:', error);
            throw error;
        }
    }

    /**
     * 检查是否已答
     * @private
     */
    _isAnswered(element) {
        // 使用平台适配器检查
        const platform = PlatformManager.getCurrentAdapter();
        if (platform && platform.isAnswered) {
            return platform.isAnswered(element);
        }

        // 默认使用VueUtils
        const VueUtils = require('../core/vue-utils.js').default;
        return VueUtils.isAnswered(element);
    }

    /**
     * 暂停答题
     */
    pause() {
        if (!this.running) {
            logger.warn('[AutoAnswer] 未在运行中');
            return;
        }

        this.paused = true;
        logger.info('[AutoAnswer] ⏸️ 已暂停');
    }

    /**
     * 恢复答题
     */
    resume() {
        if (!this.running) {
            logger.warn('[AutoAnswer] 未在运行中');
            return;
        }

        this.paused = false;
        logger.info('[AutoAnswer] ▶️ 已恢复');
    }

    /**
     * 停止答题
     */
    stop() {
        this.running = false;
        this.paused = false;
        logger.info('[AutoAnswer] ⏹️ 已停止');
    }

    /**
     * 重置进度
     */
    resetProgress() {
        this.progress = {
            total: 0,
            answered: 0,
            success: 0,
            failed: 0,
            skipped: 0
        };
        this.results = [];
    }

    /**
     * 检查多选题答案是否可疑
     * @private
     */
    _checkMultipleChoiceAnswer(type, answer) {
        // 只检查多选题（类型'1'或'multiple'）
        if (type !== '1' && type !== 'multiple' && type !== QUESTION_TYPES.DUOXUAN) {
            return null;
        }
        
        // 解析答案数量
        let answerCount = 0;
        if (Array.isArray(answer)) {
            answerCount = answer.length;
        } else if (typeof answer === 'string') {
            // 分割逗号
            answerCount = answer.split(/[,，]/).filter(Boolean).length;
        }
        
        // 如果只有1个答案，返回警告
        if (answerCount === 1) {
            return `⚠️ 多选题只有1个答案 "${answer}"，题库可能不完整`;
        }
        
        return null;
    }

    /**
     * 获取进度
     * @returns {object} 进度信息
     */
    getProgress() {
        return {
            ...this.progress,
            percentage: this.progress.total > 0
                ? Math.round((this.progress.answered / this.progress.total) * 100)
                : 0,
            running: this.running,
            paused: this.paused
        };
    }

    /**
     * 获取结果
     * @returns {object} 答题结果
     */
    getResult() {
        return {
            progress: this.progress,
            results: this.results,
            summary: {
                successRate: this.progress.total > 0
                    ? Math.round((this.progress.success / this.progress.total) * 100)
                    : 0,
                duration: Date.now() // 简化，实际应记录开始时间
            }
        };
    }
}

// 导出单例
export default new AutoAnswer();
