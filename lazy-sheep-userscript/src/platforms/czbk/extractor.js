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

        // 方法2: 从 data-type 属性获取 (刷课习题页可能用)
        const dataType = questionItem.getAttribute('data-type');
        if (dataType !== null) {
            return String(dataType);
        }

        // 方法3: 从 Vue 数据获取
        const vueData = VueUtils.getQuestionData(questionItem);
        if (vueData?.questionType != null) {
            return String(vueData.questionType);
        }

        // 方法4: 从 DOM 结构推断
        // 多选题：有checkbox
        if (questionItem.querySelector(SELECTORS.checkbox)) {
            return QUESTION_TYPES.DUOXUAN;
        }

        // 简答题：有编辑器或textarea
        if (questionItem.querySelector(SELECTORS.editorBox) || 
            questionItem.querySelector('textarea')) {
            return QUESTION_TYPES.JIANDA;
        }

        // 填空题：有填空输入框
        if (questionItem.querySelector(SELECTORS.fillInput) || 
            questionItem.querySelector('input.tk_input, input[type="text"]:not([readonly])')) {
            return QUESTION_TYPES.TIANKONG;
        }

        // 判断题和单选题都有radio，需要进一步判断
        const radios = questionItem.querySelectorAll(SELECTORS.radio);
        if (radios.length > 0) {
            // 判断题特征：
            // 1. 有 el-radio-group 类名
            // 2. 只有2个radio
            // 3. 选项文本是"正确/错误"或"是/否"
            const hasRadioGroup = questionItem.querySelector('.el-radio-group');
            const radioLabels = Array.from(questionItem.querySelectorAll('label.el-radio, .el-radio__label, .el-radio__input + span')).map(l => l.textContent.trim());
            
            if (hasRadioGroup || radios.length === 2) {
                // 检查是否为典型的判断题选项
                const isJudgeOptions = radioLabels.some(text => 
                    /^(正确|错误|对|错|是|否|√|×|T|F|True|False)$/i.test(text)
                );
                if (isJudgeOptions || radios.length === 2) {
                    return QUESTION_TYPES.PANDUAN;
                }
            }
            
            // 否则是单选题
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

        // 方法2: 从 DOM 获取 - 标准答题页
        const contentEl = questionItem.querySelector(SELECTORS.questionContent);
        if (contentEl) {
            return normalizeWhitespace(stripHtml(contentEl.textContent));
        }

        // 方法3: 刷课习题页 - 尝试其他选择器
        const alternativeSelectors = [
            '.question-text',     // 刷课习题页可能用的选择器
            '.question-title',
            '.topic-content',
            'p:first-of-type',    // 第一个p标签通常是题目
            '.question-info-box > div:first-child'  // question-info-box的第一个div
        ];

        for (const selector of alternativeSelectors) {
            const el = questionItem.querySelector(selector);
            if (el && el.textContent.trim()) {
                return normalizeWhitespace(stripHtml(el.textContent));
            }
        }

        // 方法4: 直接使用questionItem的文本内容（作为最后手段）
        // 但需要排除选项和按钮等内容
        const text = questionItem.textContent;
        if (text) {
            // 移除明显的非题目内容
            const cleanText = text
                .replace(/\s+/g, ' ')
                .replace(/[A-Z]\s*、.*$/g, '')  // 移除选项
                .trim();
            if (cleanText.length > 5) {  // 至少5个字符才认为是有效题目
                return cleanText;
            }
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
     * 刷课习题页: .question-info-box (内含多个题目)
     * 
     * @returns {Array<object>} 题目数组
     */
    extractAllQuestions() {
        // 调试日志
        console.log('[Extractor] 查找题目元素...');
        
        // 首先尝试标准答题页选择器
        let questionItems = document.querySelectorAll('.question-item-box[data-id]');
        console.log('[Extractor] .question-item-box[data-id]:', questionItems.length);
        
        if (questionItems.length > 0) {
            return Array.from(questionItems).map(item => this.extractQuestion(item));
        }
        
        // 检查是否为刷课习题页（只有一个 .question-info-box 容器）
        const exerciseContainer = document.querySelector('.answer-questions-box, .questions-lists-box');
        console.log('[Extractor] 刷课习题容器:', exerciseContainer);
        
        if (exerciseContainer) {
            // 刷课习题页：查找所有 .question-info-box 并根据内容过滤
            const allQuestionBoxes = exerciseContainer.querySelectorAll('.question-info-box');
            console.log('[Extractor] .question-info-box 总数:', allQuestionBoxes.length);
            
            const questions = [];
            let radioCount = 0, checkboxCount = 0, judgeCount = 0, fillCount = 0, essayCount = 0;
            
            allQuestionBoxes.forEach(box => {
                // 检查是否包含表单元素（题目）
                const hasRadio = box.querySelector('input[type="radio"]');
                const hasCheckbox = box.querySelector('input[type="checkbox"]');
                const hasText = box.querySelector('input[type="text"]:not([readonly])');
                const hasTextarea = box.querySelector('textarea');
                
                if (hasRadio || hasCheckbox || hasText || hasTextarea) {
                    questions.push(box);
                    
                    // 使用extractQuestionType精确判断题型
                    const type = this.extractQuestionType(box);
                    switch(type) {
                        case QUESTION_TYPES.DANXUAN:
                            radioCount++;
                            break;
                        case QUESTION_TYPES.DUOXUAN:
                            checkboxCount++;
                            break;
                        case QUESTION_TYPES.PANDUAN:
                            judgeCount++;
                            break;
                        case QUESTION_TYPES.TIANKONG:
                            fillCount++;
                            break;
                        case QUESTION_TYPES.JIANDA:
                            essayCount++;
                            break;
                    }
                }
            });
            
            console.log('[Extractor] 单选题:', radioCount);
            console.log('[Extractor] 多选题:', checkboxCount);
            console.log('[Extractor] 判断题:', judgeCount);
            console.log('[Extractor] 填空题:', fillCount);
            console.log('[Extractor] 简答题:', essayCount);
            console.log('[Extractor] 刷课习题页总题目数:', questions.length);
            
            if (questions.length > 0) {
                return questions.map(item => this.extractQuestion(item));
            }
        }
        
        // 最后尝试其他选择器
        questionItems = document.querySelectorAll('.question-item, .questionItem');
        console.log('[Extractor] .question-item, .questionItem:', questionItems.length);
        
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
