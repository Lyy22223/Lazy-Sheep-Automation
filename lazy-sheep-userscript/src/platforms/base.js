/**
 * 懒羊羊自动化平台 - 平台适配器基类
 * @author 懒羊羊
 * @description 定义所有平台适配器必须实现的接口
 */

import { PLATFORMS } from '../core/constants.js';

export default class PlatformAdapter {
    /**
     * 获取平台ID
     * @returns {string} 平台标识符
     */
    getPlatformId() {
        return PLATFORMS.UNKNOWN;
    }

    /**
     * 获取平台名称
     * @returns {string} 平台中文名称
     */
    getPlatformName() {
        return '未知平台';
    }

    /**
     * 检测是否匹配当前页面
     * @returns {boolean} 是否匹配
     */
    matchPage() {
        return false;
    }

    // ==================== 数据提取方法 ====================

    /**
     * 提取单个题目信息
     * @param {Element} element - 题目元素
     * @returns {object|null} 题目数据
     */
    extractQuestion(element) {
        throw new Error('子类必须实现 extractQuestion 方法');
    }

    /**
     * 提取所有题目
     * @returns {Array} 题目数组
     */
    extractAllQuestions() {
        throw new Error('子类必须实现 extractAllQuestions 方法');
    }

    /**
     * 获取题目类型
     * @param {Element} element - 题目元素
     * @returns {string} 题型代码
     */
    getQuestionType(element) {
        throw new Error('子类必须实现 getQuestionType 方法');
    }

    /**
     * 获取题目ID
     * @param {Element} element - 题目元素
     * @returns {string|null} 题目ID
     */
    getQuestionId(element) {
        throw new Error('子类必须实现 getQuestionId 方法');
    }

    /**
     * 获取题目内容
     * @param {Element} element - 题目元素
     * @returns {string} 题目内容
     */
    getQuestionContent(element) {
        throw new Error('子类必须实现 getQuestionContent 方法');
    }

    /**
     * 获取选项列表
     * @param {Element} element - 题目元素
     * @returns {Array<string>} 选项列表
     */
    getOptions(element) {
        throw new Error('子类必须实现 getOptions 方法');
    }

    // ==================== 答案填充方法 ====================

    /**
     * 填充答案
     * @param {Element} element - 题目元素
     * @param {string} answer - 答案
     * @param {string} type - 题型
     * @returns {Promise<boolean>} 是否成功
     */
    async fillAnswer(element, answer, type) {
        throw new Error('子类必须实现 fillAnswer 方法');
    }

    // ==================== 页面操作方法 ====================

    /**
     * 点击提交按钮
     * @returns {Promise<boolean>} 是否成功
     */
    async clickSubmit() {
        throw new Error('子类必须实现 clickSubmit 方法');
    }

    /**
     * 点击保存按钮
     * @returns {Promise<boolean>} 是否成功
     */
    async clickSave() {
        throw new Error('子类必须实现 clickSave 方法');
    }

    /**
     * 处理确认对话框
     * @returns {Promise<boolean>} 是否成功
     */
    async handleConfirmDialog() {
        return false; // 默认不处理
    }

    // ==================== 页面检测方法 ====================

    /**
     * 检测是否为作业列表页面
     * @returns {boolean}
     */
    isBusyworkListPage() {
        return false;
    }

    /**
     * 检测是否为答题页面
     * @returns {boolean}
     */
    isAnswerPage() {
        return false;
    }

    /**
     * 检测是否为考试页面
     * @returns {boolean}
     */
    isExamPage() {
        return false;
    }
}
