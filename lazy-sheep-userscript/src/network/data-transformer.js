/**
 * 数据格式转换器
 * @description 处理传智播客平台格式和数据库格式之间的转换
 */

import { logger } from '../core/utils.js';
import { QUESTION_TYPES } from '../core/constants.js';

class DataTransformer {
    /**
     * 将平台格式转换为数据库格式
     * @param {object} platformData - 平台数据
     * @returns {object} 数据库格式数据
     */
    platformToDatabase(platformData) {
        try {
            const {
                questionId,
                id,
                questionType,
                questionContent,
                questionContentText,
                content,
                options,
                questionOptionList,
                answer,
                stuAnswer,
                correctAnswer
            } = platformData;

            // 1. 题目ID（优先级：questionId > id）
            const dbQuestionId = questionId || id;

            // 2. 题型（统一为字符串）
            const dbType = this._normalizeType(questionType);

            // 3. 题目内容（多个可能的字段名）
            const dbContent = questionContentText || questionContent || content || '';

            // 4. 选项（需要标准化处理）
            const dbOptions = this._normalizeOptions(options, questionOptionList);

            // 5. 答案（优先级：correctAnswer > answer）
            let dbAnswer = correctAnswer || answer || '';
            
            // 清理答案中的【】符号（仅填空题需要，简答题不需要）
            if (dbType === '3') {
                dbAnswer = this._cleanBrackets(dbAnswer);
            }

            // 6. 答案文本（根据选项解析）
            const dbAnswerText = this._generateAnswerText(dbAnswer, dbOptions, dbType);

            return {
                questionId: dbQuestionId,
                questionContent: dbContent,
                type: dbType,
                answer: dbAnswer,
                answerText: dbAnswerText,
                options: dbOptions,
                platform: 'czbk'
            };

        } catch (error) {
            logger.error('[DataTransformer] 平台→数据库 转换失败:', error);
            return null;
        }
    }

    /**
     * 将数据库格式转换为平台格式
     * @param {object} dbData - 数据库数据
     * @returns {object} 平台格式数据
     */
    databaseToPlatform(dbData) {
        try {
            const {
                questionId,
                content,
                type,
                answer,
                answerText,
                options,
                confidence
            } = dbData;

            // 平台需要的格式
            return {
                id: questionId,
                questionId: questionId,
                questionType: type,
                questionContent: content,
                questionContentText: content,
                answer: answer,
                answerText: answerText,
                options: options,
                questionOptionList: this._optionsToList(options),
                confidence: confidence || 1.0
            };

        } catch (error) {
            logger.error('[DataTransformer] 数据库→平台 转换失败:', error);
            return null;
        }
    }

    /**
     * 标准化题型
     * @private
     */
    _normalizeType(questionType) {
        // 确保题型是字符串格式
        if (questionType === null || questionType === undefined) {
            return '0'; // 默认单选
        }
        return String(questionType);
    }

    /**
     * 清理答案中的【】符号
     * @private
     */
    _cleanBrackets(answer) {
        if (!answer || typeof answer !== 'string') {
            return answer;
        }
        // 移除中文方括号【】
        return answer.replace(/【|】/g, '').trim();
    }

    /**
     * 标准化选项格式
     * @private
     */
    _normalizeOptions(options, questionOptionList) {
        // 优先使用questionOptionList
        if (questionOptionList && Array.isArray(questionOptionList)) {
            return questionOptionList.map((opt, index) => {
                if (typeof opt === 'string') {
                    return opt;
                }
                if (opt.text) {
                    return opt.text;
                }
                if (opt.content) {
                    return opt.content;
                }
                return String(opt);
            });
        }

        // 处理options字段
        if (options) {
            // 如果是JSON字符串，解析它
            if (typeof options === 'string') {
                try {
                    const parsed = JSON.parse(options);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (e) {
                    logger.warn('[DataTransformer] 解析options失败，当作普通字符串处理');
                }
            }

            // 如果已经是数组
            if (Array.isArray(options)) {
                return options;
            }
        }

        return [];
    }

    /**
     * 生成答案文本说明
     * @private
     */
    _generateAnswerText(answer, options, type) {
        if (!answer) {
            return '';
        }

        // 判断题：直接返回
        if (type === '2' || type === QUESTION_TYPES.PANDUAN) {
            return answer; // "对" 或 "错"
        }

        // 填空/简答题：直接返回
        if (type === '3' || type === '4' || 
            type === QUESTION_TYPES.TIANKONG || 
            type === QUESTION_TYPES.JIANDA) {
            return answer;
        }

        // 单选/多选：解析字母到文本
        if (options && options.length > 0) {
            // 解析答案字母
            const answerLetters = Array.isArray(answer) 
                ? answer 
                : String(answer).split(/[,，]/).map(a => a.trim()).filter(Boolean);
            
            const answerTexts = answerLetters.map(letter => {
                const index = letter.charCodeAt(0) - 65; // A=0, B=1, ...
                return options[index] || letter;
            });
            
            return answerTexts.join('；');
        }

        return String(answer);
    }

    /**
     * 将options数组转换为questionOptionList格式
     * @private
     */
    _optionsToList(options) {
        if (!options || !Array.isArray(options)) {
            return [];
        }

        return options.map((text, index) => ({
            key: String.fromCharCode(65 + index), // A, B, C, D...
            text: text
        }));
    }

    /**
     * 批量转换：平台→数据库
     * @param {Array} platformDataList - 平台数据列表
     * @returns {Array} 数据库格式数据列表
     */
    batchPlatformToDatabase(platformDataList) {
        if (!Array.isArray(platformDataList)) {
            return [];
        }

        return platformDataList
            .map(data => this.platformToDatabase(data))
            .filter(Boolean); // 过滤掉转换失败的
    }

    /**
     * 批量转换：数据库→平台
     * @param {Array} dbDataList - 数据库数据列表
     * @returns {Array} 平台格式数据列表
     */
    batchDatabaseToPlatform(dbDataList) {
        if (!Array.isArray(dbDataList)) {
            return [];
        }

        return dbDataList
            .map(data => this.databaseToPlatform(data))
            .filter(Boolean);
    }

    /**
     * 从纠错结果提取正确答案数据
     * @param {object} error - 错题对象
     * @param {string} correctAnswer - 纠错成功的正确答案
     * @returns {object} 可上传的数据库格式
     */
    extractCorrectAnswerFromCorrectionResult(error, correctAnswer) {
        try {
            const {
                questionId,
                questionType,
                content,
                options
            } = error;

            // 构建数据库格式
            const dbData = {
                questionId: questionId,
                questionContent: content,
                type: this._normalizeType(questionType),
                answer: correctAnswer,
                platform: 'czbk',
                confidence: 1.0, // 经过验证的正确答案，置信度最高
                source: 'correction' // 来源：纠错系统
            };

            // 添加选项
            if (options && options.length > 0) {
                dbData.options = options;
                dbData.answerText = this._generateAnswerText(
                    correctAnswer,
                    options,
                    dbData.type
                );
            } else {
                dbData.answerText = correctAnswer;
            }

            return dbData;

        } catch (error) {
            logger.error('[DataTransformer] 提取纠错答案失败:', error);
            return null;
        }
    }

    /**
     * 验证数据完整性
     * @param {object} data - 待验证的数据
     * @returns {boolean} 是否有效
     */
    validateDatabaseFormat(data) {
        if (!data) {
            return false;
        }

        // 必需字段检查
        const required = ['questionId', 'questionContent', 'type', 'answer'];
        for (const field of required) {
            if (!data[field]) {
                logger.warn(`[DataTransformer] 缺少必需字段: ${field}`);
                return false;
            }
        }

        // 题型检查
        if (!['0', '1', '2', '3', '4'].includes(data.type)) {
            logger.warn(`[DataTransformer] 无效题型: ${data.type}`);
            return false;
        }

        return true;
    }

    /**
     * 清理数据（移除无效字段）
     * @param {object} data - 原始数据
     * @returns {object} 清理后的数据
     */
    cleanData(data) {
        const cleaned = {};

        const validFields = [
            'questionId',
            'questionContent',
            'type',
            'answer',
            'answerText',
            'options',
            'platform',
            'confidence',
            'source'
        ];

        for (const field of validFields) {
            if (data[field] !== undefined && data[field] !== null) {
                cleaned[field] = data[field];
            }
        }

        return cleaned;
    }
}

// 导出单例
export default new DataTransformer();
