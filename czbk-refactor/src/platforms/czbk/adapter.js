/**
 * 懒羊羊自动化平台 - 传智播客平台适配器
 * @author 懒羊羊
 * @description 实现完整的平台接口
 */

import PlatformAdapter from '../base.js';
import { PLATFORMS } from '../../core/constants.js';
import { sleep, logger } from '../../core/utils.js';
import AnswerFiller from '../../modules/answer-filler.js';
import CzbkExtractor from './extractor.js';
import SELECTORS from './selectors.js';

export default class CzbkAdapter extends PlatformAdapter {
    constructor() {
        super();
        this.extractor = new CzbkExtractor();
    }

    // ==================== 平台识别 ====================

    getPlatformId() {
        return PLATFORMS.CZBK;
    }

    getPlatformName() {
        return '传智播客';
    }

    /**
     * 检测是否匹配当前页面
     * @returns {boolean}
     */
    matchPage() {
        return window.location.hostname.includes('ityxb.com');
    }

    // ==================== 数据提取 ====================

    extractQuestion(element) {
        return this.extractor.extractQuestion(element);
    }

    extractAllQuestions() {
        return this.extractor.extractAllQuestions();
    }

    getQuestionType(element) {
        return this.extractor.extractQuestionType(element);
    }

    getQuestionId(element) {
        return this.extractor.extractQuestionId(element);
    }

    getQuestionContent(element) {
        return this.extractor.extractQuestionContent(element);
    }

    getOptions(element) {
        const type = this.getQuestionType(element);
        return this.extractor.extractOptions(element, type);
    }

    // ==================== 答案填充 ====================

    /**
     * 填充答案
     * @param {Element} element - 题目元素
     * @param {string} answer - 答案
     * @param {string} type - 题型
     * @returns {Promise<boolean>} 是否成功
     */
    async fillAnswer(element, answer, type = null) {
        return await AnswerFiller.fill(element, answer, type);
    }

    // ==================== 页面操作 ====================

    /**
     * 点击提交按钮
     * @returns {Promise<boolean>}
     */
    async clickSubmit() {
        try {
            const submitBtn = document.querySelector(SELECTORS.submitButton);

            if (!submitBtn) {
                logger.error('[CZBK] 未找到提交按钮');
                return false;
            }

            submitBtn.click();
            logger.info('[CZBK] 已点击提交按钮');

            // 处理确认对话框
            logger.info('[CZBK] 等待确认对话框...');
            await sleep(800);
            const confirmed = await this.handleConfirmDialog();
            
            if (!confirmed) {
                logger.warn('[CZBK] 未找到确认对话框或点击失败');
                return false;
            }
            
            logger.info('[CZBK] ✅ 提交确认完成！');
            await sleep(1000);
            return true;
        } catch (error) {
            logger.error('[CZBK] 点击提交失败:', error);
            return false;
        }
    }

    /**
     * 点击保存按钮
     * @returns {Promise<boolean>}
     */
    async clickSave() {
        try {
            const saveBtn = document.querySelector(SELECTORS.saveButton);

            if (!saveBtn) {
                logger.warn('[CZBK] 未找到保存按钮（可能不是作业页面）');
                return false;
            }

            saveBtn.click();
            logger.info('[CZBK] 已点击保存按钮');

            await sleep(1000);
            return true;
        } catch (error) {
            logger.error('[CZBK] 点击保存失败:', error);
            return false;
        }
    }

    /**
     * 处理确认对话框（带重试机制）
     * 
     * 实际测试: 确认按钮文本为 "坚持交卷", "确认交卷", "确定"
     * 
     * @param {number} maxRetries - 最大重试次数
     * @returns {Promise<boolean>}
     */
    async handleConfirmDialog(maxRetries = 5) {
        try {
            // 重试查找对话框
            let dialog = null;
            for (let i = 0; i < maxRetries; i++) {
                dialog = document.querySelector(SELECTORS.confirmDialog);
                if (dialog) {
                    break;
                }
                logger.debug(`[CZBK] 等待对话框出现... (${i + 1}/${maxRetries})`);
                await sleep(300);
            }

            if (!dialog) {
                logger.debug('[CZBK] 未找到确认对话框');
                return false;
            }
            
            // 检查对话框消息内容
            const messageBox = dialog.querySelector('.el-message-box__message');
            const message = messageBox ? messageBox.textContent.trim() : '';
            logger.info(`[CZBK] 📋 对话框消息: ${message}`);

            // 方法1: 优先使用类选择器查找确认按钮
            let confirmBtn = dialog.querySelector('.common-msg-yes-btn');
            
            if (confirmBtn) {
                logger.info(`[CZBK] ✓ 找到确认按钮: ${confirmBtn.textContent.trim()}`);
                confirmBtn.click();
                logger.info('[CZBK] 👆 已点击确认按钮');
                await sleep(300);
                return true;
            }
            
            // 方法2: 使用文本匹配查找按钮
            logger.debug('[CZBK] 类选择器未找到，尝试文本匹配...');
            const buttons = dialog.querySelectorAll('button');
            confirmBtn = Array.from(buttons).find(btn =>
                SELECTORS.confirmButtonTexts.some(text =>
                    btn.textContent.includes(text)
                )
            );

            if (confirmBtn) {
                logger.info(`[CZBK] ✓ 找到确认按钮: ${confirmBtn.textContent.trim()}`);
                confirmBtn.click();
                logger.info('[CZBK] 👆 已点击确认按钮');
                await sleep(300);
                return true;
            }

            // 未找到确认按钮，输出详细信息
            logger.warn('[CZBK] ❌ 未找到确认按钮');
            logger.debug('[CZBK] 对话框中的按钮:', Array.from(buttons).map(btn => btn.textContent.trim()));
            return false;
        } catch (error) {
            logger.error('[CZBK] 处理确认对话框失败:', error);
            return false;
        }
    }

    // ==================== 页面检测 ====================

    /**
     * 检测是否为作业列表页面
     * @returns {boolean}
     */
    isBusyworkListPage() {
        return window.location.pathname.includes('/busywork') &&
            !window.location.pathname.match(/\/busywork\/\d+/);
    }

    /**
     * 检测是否为答题页面
     * @returns {boolean}
     */
    isAnswerPage() {
        return document.querySelectorAll(SELECTORS.questionItem).length > 0;
    }

    /**
     * 检测是否为考试页面
     * @returns {boolean}
     */
    isExamPage() {
        return window.location.pathname.includes('/exam');
    }

    // ==================== 辅助方法 ====================

    /**
     * 检查提交是否成功
     * @returns {boolean}
     */
    checkSubmitSuccess() {
        const successMsg = document.querySelector(SELECTORS.successMessage);
        return !!successMsg;
    }

    /**
     * 获取统计信息
     * @returns {object}
     */
    getStatistics() {
        return this.extractor.getStatistics();
    }
}
