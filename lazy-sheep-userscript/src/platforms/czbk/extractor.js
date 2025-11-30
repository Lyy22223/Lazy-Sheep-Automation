/**
 * 懒羊羊自动化平台 - 传智播客数据提取器
 * @author 懒羊羊
 * @description 负责从DOM中提取题目数据
 */

import { QUESTION_TYPES } from '../../core/constants.js';
import { stripHtml, normalizeWhitespace } from '../../core/utils.js';
import VueUtils from '../../core/vue-utils.js';
import SELECTORS from './selectors.js';

export default class CzbkExtractor {
    /**
     * 提取题目ID
     * 
     * 实际测试: 32位UUID格式
     * 
     * @param {Element} questionItem - 题目元素
     * @returns {string|null} 题目ID
     */
    extractQuestionId(questionItem) {
        // 方法1: 从 data-id 属性获取
        const dataId = questionItem.dataset.id ||
            questionItem.getAttribute('data-id');

        if (dataId) return dataId;

        // 方法2: 从 Vue 数据获取
        const vueData = VueUtils.getQuestionData(questionItem);
        return vueData?.id || vueData?.questionId || null;
    }

    /**
     * 提取题目类型
     * 
     * 实际测试: 优先从父容器ID判断 (最准确)
     * 
     * @param {Element} questionItem - 题目元素
     * @returns {string} 题型代码 (0-5)
     */
    extractQuestionType(questionItem) {
        // 方法1: 从父容器ID判断 (基于 app.js 第 8258-8269 行)
        const parent = questionItem.closest(
            '#danxuanQuestionBox, #duoxuanQuestionBox, #panduanQuestionBox, ' +
            '#tiankongQuestionBox, #jiandaQuestionBox, #bianchengQuestionBox'
        );

        if (parent) {
            const typeMap = {
                'danxuanQuestionBox': QUESTION_TYPES.DANXUAN,
                'duoxuanQuestionBox': QUESTION_TYPES.DUOXUAN,
                'panduanQuestionBox': QUESTION_TYPES.PANDUAN,
                'tiankongQuestionBox': QUESTION_TYPES.TIANKONG,
                'jiandaQuestionBox': QUESTION_TYPES.JIANDA,
                'bianchengQuestionBox': QUESTION_TYPES.BIANCHENG
            };
            return typeMap[parent.id] || QUESTION_TYPES.DANXUAN;
        }

        // 方法2: 从 Vue 数据获取
        const vueData = VueUtils.getQuestionData(questionItem);
        if (vueData?.questionType != null) {
            return String(vueData.questionType);
        }

        // 方法3: 从 DOM 结构推断
        if (questionItem.querySelector(SELECTORS.checkbox)) {
            return QUESTION_TYPES.DUOXUAN;
        }

        if (questionItem.querySelector(SELECTORS.fillInput)) {
            return QUESTION_TYPES.TIANKONG;
        }

        if (questionItem.querySelector(SELECTORS.editorBox)) {
            return QUESTION_TYPES.JIANDA;
        }

        const radioCount = questionItem.querySelectorAll(SELECTORS.radio).length;
        if (radioCount === 2) {
            return QUESTION_TYPES.PANDUAN;
        }

        if (radioCount > 0) {
            return QUESTION_TYPES.DANXUAN;
        }

        // 默认单选题
        return QUESTION_TYPES.DANXUAN;
    }

    /**
     * 提取题目内容
     * @param {Element} questionItem - 题目元素
     * @returns {string} 题目内容
     */
    extractQuestionContent(questionItem) {
        // 方法1: 从 Vue 数据获取
        const vueData = VueUtils.getQuestionData(questionItem);
        if (vueData?.questionContent) {
            return stripHtml(vueData.questionContent).trim();
        }

        // 方法2: 从 DOM 获取
        const contentEl = questionItem.querySelector(SELECTORS.questionContent);
        if (contentEl) {
            return normalizeWhitespace(stripHtml(contentEl.textContent));
        }

        return '';
    }

    /**
     * 提取选项列表
     * 
     * 实际测试: radio/checkbox的value是字母 "A", "B", "C", "D"
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string} questionType - 题型
     * @returns {Array<string>} 选项列表
     */
    extractOptions(questionItem, questionType) {
        // 只有选择题和判断题有选项
        if (![QUESTION_TYPES.DANXUAN, QUESTION_TYPES.DUOXUAN, QUESTION_TYPES.PANDUAN]
            .includes(questionType)) {
            return [];
        }

        // 方法1: 从 Vue 数据获取
        const vueData = VueUtils.getQuestionData(questionItem);
        if (vueData?.questionOptionList && Array.isArray(vueData.questionOptionList)) {
            return vueData.questionOptionList.map(opt =>
                stripHtml(opt.optionContent || opt.content || '').trim()
            );
        }

        // 方法2: 从 DOM 获取
        const optionElements = questionItem.querySelectorAll(SELECTORS.optionItem);
        if (optionElements.length > 0) {
            return Array.from(optionElements).map(el =>
                normalizeWhitespace(stripHtml(el.textContent))
            );
        }

        return [];
    }

    /**
     * 提取完整题目信息
     * @param {Element} questionItem - 题目元素
     * @returns {object} 题目数据
     */
    extractQuestion(questionItem) {
        const questionId = this.extractQuestionId(questionItem);
        const questionType = this.extractQuestionType(questionItem);
        const questionContent = this.extractQuestionContent(questionItem);
        const options = this.extractOptions(questionItem, questionType);

        // 从 Vue 获取额外信息
        const vueData = VueUtils.getQuestionData(questionItem);

        return {
            id: questionId,
            questionId: vueData?.questionId || questionId,
            type: questionType,
            content: questionContent,
            options: options,
            answer: vueData?.stuAnswer || null,
            element: questionItem,
            platform: 'czbk'
        };
    }

    /**
     * 提取所有题目
     * 
     * 实际测试: 91个题目，选择器 .question-item-box[data-id]
     * 
     * @returns {Array<object>} 题目数组
     */
    extractAllQuestions() {
        const questionItems = document.querySelectorAll(SELECTORS.questionItem);
        return Array.from(questionItems).map(item => this.extractQuestion(item));
    }

    /**
     * 按题型分组题目
     * @returns {object} 按题型分组的题目
     */
    extractQuestionsByType() {
        const allQuestions = this.extractAllQuestions();
        const grouped = {
            [QUESTION_TYPES.DANXUAN]: [],
            [QUESTION_TYPES.DUOXUAN]: [],
            [QUESTION_TYPES.PANDUAN]: [],
            [QUESTION_TYPES.TIANKONG]: [],
            [QUESTION_TYPES.JIANDA]: [],
            [QUESTION_TYPES.BIANCHENG]: []
        };

        for (const question of allQuestions) {
            if (grouped[question.type]) {
                grouped[question.type].push(question);
            }
        }

        return grouped;
    }

    /**
     * 获取统计信息
     * @returns {object} 统计数据
     */
    getStatistics() {
        const questions = this.extractAllQuestions();
        const byType = this.extractQuestionsByType();

        return {
            total: questions.length,
            byType: {
                danxuan: byType[QUESTION_TYPES.DANXUAN].length,
                duoxuan: byType[QUESTION_TYPES.DUOXUAN].length,
                panduan: byType[QUESTION_TYPES.PANDUAN].length,
                tiankong: byType[QUESTION_TYPES.TIANKONG].length,
                jianda: byType[QUESTION_TYPES.JIANDA].length,
                biancheng: byType[QUESTION_TYPES.BIANCHENG].length
            }
        };
    }
}
