/**
 * 懒羊羊自动化平台 - 提交处理模块
 * @author 懒羊羊
 * @description 处理作业/考试提交，包括对话框确认
 */

import { logger, sleep } from '../core/utils.js';
import { DELAY_CONFIG } from '../core/constants.js';
import PlatformManager from '../platforms/manager.js';
import NetworkInterceptor from '../network/interceptor.js';

class SubmitHandler {
    constructor() {
        this.submitting = false;
        this.lastSubmitTime = 0;
    }

    /**
     * 提交作业/考试
     * @param {object} options - 配置选项
     * @returns {Promise<boolean>} 是否成功
     */
    async submit(options = {}) {
        if (this.submitting) {
            logger.warn('[Submit] 正在提交中，请勿重复操作');
            return false;
        }

        try {
            this.submitting = true;

            const {
                autoConfirm = true,      // 自动确认对话框
                waitResult = true,       // 等待结果
                timeout = 30000          // 超时时间
            } = options;

            logger.info('[Submit] 🚀 开始提交');

            // 获取平台适配器
            const platform = PlatformManager.getCurrentAdapter();
            if (!platform) {
                throw new Error('未检测到支持的平台');
            }

            // 设置结果监听
            let submitResult = null;
            if (waitResult) {
                submitResult = this._waitForSubmitResult(timeout);
            }

            // 点击提交按钮
            const clicked = await platform.clickSubmit();
            if (!clicked) {
                throw new Error('点击提交按钮失败');
            }

            logger.info('[Submit] 已点击提交按钮');

            // 等待确认对话框
            if (autoConfirm) {
                await sleep(500);
                await platform.handleConfirmDialog();
            }

            // 等待提交结果
            if (waitResult && submitResult) {
                const result = await submitResult;

                if (result) {
                    logger.info('[Submit] ✅ 提交成功');
                    this._handleSubmitResult(result);
                    return true;
                } else {
                    logger.warn('[Submit] ⚠️ 提交超时');
                    return false;
                }
            }

            this.lastSubmitTime = Date.now();
            return true;

        } catch (error) {
            logger.error('[Submit] 提交失败:', error);
            return false;
        } finally {
            this.submitting = false;
        }
    }

    /**
     * 保存当前答案
     * @returns {Promise<boolean>} 是否成功
     */
    async save() {
        try {
            logger.info('[Submit] 💾 保存答案');

            const platform = PlatformManager.getCurrentAdapter();
            if (!platform) {
                throw new Error('未检测到支持的平台');
            }

            const saved = await platform.clickSave();

            if (saved) {
                logger.info('[Submit] ✅ 保存成功');
                return true;
            } else {
                logger.warn('[Submit] 保存按钮不可用（可能是考试页面）');
                return false;
            }

        } catch (error) {
            logger.error('[Submit] 保存失败:', error);
            return false;
        }
    }

    /**
     * 等待提交结果
     * @private
     */
    _waitForSubmitResult(timeout) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve(null);
            }, timeout);

            const handler = (data) => {
                cleanup();
                resolve(data);
            };

            const cleanup = () => {
                clearTimeout(timer);
                NetworkInterceptor.off('submit-success', handler);
            };

            NetworkInterceptor.on('submit-success', handler);
        });
    }

    /**
     * 处理提交结果
     * @private
     */
    _handleSubmitResult(result) {
        if (!result) return;

        // 显示成绩
        if (result.score !== undefined) {
            logger.info(`[Submit] 📊 成绩: ${result.score}分`);
        }

        // 显示正确率
        if (result.correctRate !== undefined) {
            logger.info(`[Submit] 📈 正确率: ${result.correctRate}%`);
        }

        // 检查错题
        if (result.errorCount > 0) {
            logger.warn(`[Submit] ❌ 错题数: ${result.errorCount}`);
        }

        // 触发错题事件（用于智能纠错）
        if (result.errorQuestions && result.errorQuestions.length > 0) {
            NetworkInterceptor._emit('errors-found', result.errorQuestions);
        }
    }

    /**
     * 检查是否可以提交
     * @returns {Promise<object>} 检查结果
     */
    async checkSubmittable() {
        try {
            const platform = PlatformManager.getCurrentAdapter();
            if (!platform) {
                return {
                    canSubmit: false,
                    reason: '未检测到支持的平台'
                };
            }

            // 提取所有题目
            const questions = platform.extractAllQuestions();

            // 统计已答题目和问题
            let answeredCount = 0;
            const issues = [];
            
            for (const q of questions) {
                const isAnswered = this._isAnswered(q.element);
                
                if (isAnswered) {
                    answeredCount++;
                    
                    // 检查多选题是否至少选择了2个答案
                    if (q.type === '1' || q.type === 'multiple') {
                        const selectedCount = this._getSelectedOptionsCount(q.element);
                        if (selectedCount < 2) {
                            issues.push({
                                type: 'single_choice_in_multiple',
                                questionIndex: q.index || questions.indexOf(q) + 1,
                                selectedCount,
                                message: `第${q.index || questions.indexOf(q) + 1}题是多选题，但只选择了${selectedCount}个答案`
                            });
                            logger.warn(`[Submit] ⚠️ 多选题检查: 第${q.index || questions.indexOf(q) + 1}题只选了${selectedCount}个答案`);
                        }
                    }
                }
            }

            const unansweredCount = questions.length - answeredCount;
            const hasIssues = issues.length > 0;
            
            let reason = '';
            if (unansweredCount > 0) {
                reason = `还有${unansweredCount}道题未答`;
            } else if (hasIssues) {
                reason = `有${issues.length}道多选题可能只选择了1个答案`;
            } else {
                reason = '所有题目已答';
            }

            return {
                canSubmit: unansweredCount === 0,
                total: questions.length,
                answered: answeredCount,
                unanswered: unansweredCount,
                issues: issues,
                hasWarnings: hasIssues,
                reason: reason
            };

        } catch (error) {
            logger.error('[Submit] 检查失败:', error);
            return {
                canSubmit: false,
                reason: error.message
            };
        }
    }

    /**
     * 检查是否已答
     * @private
     */
    _isAnswered(element) {
        const VueUtils = require('../core/vue-utils.js').default;
        return VueUtils.isAnswered(element);
    }

    /**
     * 获取多选题选中的选项数量
     * @private
     */
    _getSelectedOptionsCount(element) {
        try {
            // 查找所有选中的选项
            const checkedInputs = element.querySelectorAll('input[type="checkbox"]:checked');
            return checkedInputs.length;
        } catch (error) {
            logger.debug('[Submit] 获取选中数量失败:', error);
            return 0;
        }
    }

    /**
     * 获取提交状态
     * @returns {object} 状态信息
     */
    getStatus() {
        return {
            submitting: this.submitting,
            lastSubmitTime: this.lastSubmitTime
        };
    }
}

// 导出单例
export default new SubmitHandler();
