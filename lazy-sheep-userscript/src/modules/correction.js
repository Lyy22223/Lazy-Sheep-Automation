/**
 * 懒羊羊自动化平台 - 智能纠错模块
 * @author 懒羊羊
 * @description 基于错题信息智能选择纠错策略
 * 
 * 纠错策略:
 * - 单选题: 排除法 (试错其他选项)
 * - 多选题: AI辅助排除法
 * - 判断题: 切换 (对↔错)
 * - 填空/简答: AI重新答题
 */

import { logger, sleep } from '../core/utils.js';
import { QUESTION_TYPES, CORRECTION_STRATEGIES } from '../core/constants.js';
import APIClient from '../network/api-client.js';
import DataTransformer from '../network/data-transformer.js';
import AnswerFiller from './answer-filler.js';
import SubmitHandler from './submit-handler.js';

class CorrectionManager {
    constructor() {
        this.correcting = false;
        
        // 统计信息（最近一次批改结果）
        this.latestCorrectCount = 0;
        this.latestWrongCount = 0;
        this.latestTotalCount = 0;
        
        // 已上传题目ID集合（避免重复上传）
        this.uploadedQuestions = new Set();
    }

    /**
     * 拉取错题并开始纠错
     * @param {object} options - 配置选项
     * @returns {Promise<object>} 纠错结果
     */
    async fetchAndCorrect(options = {}) {
        try {
            logger.info('[Correction] 📡 开始拉取错题...');

            // 调用平台批改接口获取结果
            const errors = await this._fetchErrorsFromPlatform();

            if (!errors || errors.length === 0) {
                logger.info('[Correction] ✅ 没有错题，真棒！');
                return {
                    total: 0,
                    success: 0,
                    failed: 0,
                    message: '没有错题'
                };
            }

            // 筛选客观题（单选0、多选1、判断2、填空3）
            const objectiveErrors = errors.filter(err => {
                const type = err.questionType?.toString();
                return ['0', '1', '2', '3'].includes(type) && err.correct === false;
            });

            logger.info(`[Correction] 找到 ${objectiveErrors.length} 道需要纠错的客观题`);

            if (objectiveErrors.length === 0) {
                return {
                    total: errors.length,
                    success: 0,
                    failed: 0,
                    message: '没有需要纠错的客观题'
                };
            }

            // 保存错题列表
            this.latestErrors = objectiveErrors;

            // 开始纠错
            return await this.correct(objectiveErrors, options);

        } catch (error) {
            logger.error('[Correction] 拉取错题失败:', error);
            throw error;
        }
    }

    /**
     * 从平台拉取错题
     * @private
     * @returns {Promise<Array>} 错题列表
     */
    async _fetchErrorsFromPlatform() {
        try {
            // 方法1: 尝试从页面数据获取
            const pageData = this._getErrorsFromPageData();
            if (pageData && pageData.length > 0) {
                logger.info('[Correction] 从页面数据获取错题');
                return pageData;
            }

            // 方法2: 调用批改接口
            logger.info('[Correction] 调用批改接口获取错题');
            const apiErrors = await this._fetchErrorsFromAPI();
            return apiErrors;

        } catch (error) {
            logger.error('[Correction] 获取错题失败:', error);
            throw error;
        }
    }

    /**
     * 从页面数据获取错题
     * @private
     */
    _getErrorsFromPageData() {
        try {
            // 查找所有题目元素
            const questionItems = document.querySelectorAll('.questionItem');
            const errors = [];

            questionItems.forEach(item => {
                // 检查是否有错误标记
                const isCorrect = item.querySelector('.correctIcon, .correct');
                const isWrong = item.querySelector('.wrongIcon, .wrong, .error');

                if (isWrong && !isCorrect) {
                    const questionId = item.getAttribute('data-id');
                    const questionType = item.getAttribute('data-type');
                    
                    // 获取题目内容
                    const contentEl = item.querySelector('.question-content, .questionContent');
                    const content = contentEl ? contentEl.textContent.trim() : '';

                    // 获取选项
                    const optionEls = item.querySelectorAll('.option-item, .optionItem, label');
                    const options = Array.from(optionEls).map(el => el.textContent.trim());

                    errors.push({
                        questionId,
                        questionType,
                        content,
                        options,
                        element: item,
                        correct: false
                    });
                }
            });

            return errors;
        } catch (error) {
            logger.error('[Correction] 从页面获取错题失败:', error);
            return [];
        }
    }

    /**
     * 从API获取错题
     * @private
     */
    async _fetchErrorsFromAPI() {
        try {
            // 获取当前作业ID
            const workId = this._getWorkIdFromURL();
            if (!workId) {
                throw new Error('无法获取作业ID');
            }

            // 判断页面类型，选择对应的接口
            const isSubmitted = this._isSubmittedPage();
            let url, method;
            
            if (isSubmitted) {
                // 已提交页面：使用 findStudentBusywork 接口（GET）
                url = `https://stu.ityxb.com/back/bxg/my/busywork/findStudentBusywork?busyworkId=${workId}&t=${Date.now()}`;
                method = 'GET';
                logger.info(`[Correction] 调用已提交结果接口, busyworkId: ${workId}`);
            } else {
                // 答题中/已保存页面：使用 startBusywork 接口（POST）
                url = 'https://stu.ityxb.com/back/bxg/my/busywork/startBusywork';
                method = 'POST';
                logger.info(`[Correction] 调用批改接口, busyworkId: ${workId}`);
            }

            // 调用平台接口
            const fetchOptions = {
                method: method,
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
            };
            
            // POST请求需要body
            if (method === 'POST') {
                fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                fetchOptions.body = `busyworkId=${workId}`;
            }
            
            const response = await fetch(url, fetchOptions);

            if (!response.ok) {
                throw new Error(`批改接口返回错误: ${response.status}`);
            }

            const result = await response.json();
            
            // 详细日志输出
            logger.info('[Correction] 响应code:', result.code);
            logger.info('[Correction] 响应errorMessage:', result.errorMessage);
            logger.info('[Correction] resultObject存在:', !!result.resultObject);
            logger.debug('[Correction] 完整响应:', result);
            
            // 检查响应格式：平台返回 resultObject
            if (!result.resultObject) {
                logger.error('[Correction] 批改接口响应格式异常:', {
                    code: result.code,
                    errorMessage: result.errorMessage,
                    hasResultObject: !!result.resultObject
                });
                throw new Error(`批改接口返回错误: ${result.errorMessage || '未找到resultObject'}`);
            }
            
            const responseData = result.resultObject;

            // 解析所有题目（包括正确和错误的）
            const { errors, correctQuestions } = this._parseQuestionsFromResponse(responseData);
            
            // 保存统计信息
            this.latestCorrectCount = correctQuestions.length;
            this.latestTotalCount = errors.length + correctQuestions.length;
            
            logger.info(`[Correction] 从批改接口解析到:`);
            logger.info(`  - 正确题目: ${correctQuestions.length} 道`);
            logger.info(`  - 错误题目: ${errors.length} 道`);
            logger.info(`  - 总计: ${this.latestTotalCount} 道`);

            // 🔥 上传所有正确答案到云端（异步，不阻塞）
            if (correctQuestions.length > 0) {
                this._uploadCorrectQuestions(correctQuestions).catch(err => {
                    logger.warn('[Correction] 批量上传正确答案失败:', err);
                });
            }

            return errors;

        } catch (error) {
            logger.error('[Correction] API获取错题失败:', error);
            throw error;
        }
    }

    /**
     * 从URL获取作业ID
     * @private
     */
    _getWorkIdFromURL() {
        // 支持两种页面：writePaper（答题中/已保存）和 lookPaper（已提交查看）
        const match = window.location.pathname.match(/\/(writePaper|lookPaper)\/busywork\/(\w+)/);
        return match ? match[2] : null;
    }
    
    /**
     * 判断是否为已提交页面
     * @private
     */
    _isSubmittedPage() {
        return window.location.pathname.includes('/lookPaper/busywork/');
    }

    /**
     * 解析批改响应中的所有题目（正确+错误）
     * @private
     */
    _parseQuestionsFromResponse(data) {
        const errors = [];
        const correctQuestions = [];
        const questionTypes = [
            { name: 'danxuan', type: '0' },
            { name: 'duoxuan', type: '1' },
            { name: 'panduan', type: '2' },
            { name: 'tiankong', type: '3' },
            { name: 'jianda', type: '4' }
        ];

        questionTypes.forEach(({ name, type }) => {
            // 从题型对象中获取 lists 数组
            const typeObject = data[name];
            
            if (!typeObject || !typeObject.lists) {
                logger.debug(`[Correction] ${name} 题型不存在或没有lists`);
                return;
            }
            
            const questions = typeObject.lists;
            
            if (!Array.isArray(questions) || questions.length === 0) {
                logger.debug(`[Correction] ${name} 题型 lists为空`);
                return;
            }

            // logger.debug(`[Correction] 解析 ${name} 题型, 共 ${questions.length} 道`);
            
            questions.forEach(q => {
                // 查找对应的DOM元素（使用 id 字段）
                const questionId = q.id;
                const element = document.querySelector(`[data-id="${questionId}"]`);
                
                // 解析选项
                let options = [];
                if (q.options && typeof q.options === 'string') {
                    try {
                        options = JSON.parse(q.options);
                    } catch (e) {
                        logger.warn(`[Correction] 解析选项失败: ${questionId}`);
                    }
                } else if (q.questionOptionList && Array.isArray(q.questionOptionList)) {
                    options = q.questionOptionList.map(opt => opt.text);
                }
                
                // 获取正确答案（可能是answer或rightAnswer字段）
                const correctAnswer = q.answer || q.rightAnswer || q.stuAnswer || '';
                
                // 第一个题目输出调试信息
                if (correctQuestions.length === 0 && errors.length === 0) {
                    logger.info(`[Correction] 题目字段示例 (${name}):`, JSON.stringify({
                        id: q.id,
                        questionType: q.questionType,
                        answer: q.answer,
                        rightAnswer: q.rightAnswer,
                        stuAnswer: q.stuAnswer,
                        correct: q.correct,
                        correctAnswer: correctAnswer,
                        options: options,
                        hasOptions: q.options,
                        hasQuestionOptionList: q.questionOptionList
                    }, null, 2));
                }
                
                const questionData = {
                    questionId: questionId,
                    questionType: q.questionType || type,
                    content: q.questionContentText || q.questionContent || '',
                    options: options,
                    stuAnswer: q.stuAnswer || '',
                    correctAnswer: correctAnswer,
                    element: element,
                    correct: q.correct
                };
                
                // 区分正确和错误的题目
                if (q.correct === false) {
                    // 错题
                    if (!element) {
                        logger.warn(`[Correction] 未找到题目元素: ${questionId}`);
                    }
                    
                    errors.push({
                        ...questionData,
                        wrongAnswer: questionData.stuAnswer
                    });
                } else if (q.correct === true) {
                    // 正确的题目 - 准备上传
                    correctQuestions.push(questionData);
                }
            });
        });

        logger.info(`[Correction] 解析完成 - 正确: ${correctQuestions.length}, 错误: ${errors.length}`);
        return { errors, correctQuestions };
    }

    /**
     * 对错题进行纠错（批量并发 + 循环验证）
     * @param {Array<object>} errors - 错题列表
     * @param {object} options - 配置选项
     * @returns {Promise<object>} 纠错结果
     */
    async correct(errors, options = {}) {
        if (this.correcting) {
            logger.warn('[Correction] 正在纠错中');
            return null;
        }

        try {
            this.correcting = true;
            const maxRetries = options.maxRetries || 3;
            
            logger.info(`[Correction] 🔧 开始纠错: ${errors.length}道错题`);
            logger.info(`[Correction] 最大重试次数: ${maxRetries}`);

            let remainingErrors = [...errors];
            let attempt = 0;
            const finalResults = [];

            // 循环纠错，最多重试 maxRetries 次
            while (attempt < maxRetries && remainingErrors.length > 0) {
                attempt++;
                logger.info(`\n[Correction] 📍 第 ${attempt}/${maxRetries} 轮纠错`);
                logger.info(`[Correction] 待纠错题目: ${remainingErrors.length} 道`);

                // 1. 并发填充所有错题的新答案
                const fillPromises = remainingErrors.map(async (error) => {
                    try {
                        logger.info(`  📝 题目 ${error.questionId} - 生成答案...`);
                        
                        // AI生成新答案（携带已尝试答案）
                        const newAnswer = await this._aiCorrection(error);
                        if (!newAnswer) {
                            logger.error(`  ❌ 题目 ${error.questionId} - AI未能生成答案`);
                            return { questionId: error.questionId, filled: false };
                        }
                        
                        // 记录尝试的答案
                        if (!error.attemptedAnswers) {
                            error.attemptedAnswers = [];
                        }
                        error.attemptedAnswers.push(newAnswer);
                        
                        logger.info(`  💡 题目 ${error.questionId} - 答案: ${newAnswer}`);
                        
                        // 填充答案到页面
                        const filled = await AnswerFiller.fill(error.element, newAnswer, error.questionType);
                        
                        if (filled) {
                            logger.info(`  ✅ 题目 ${error.questionId} - 填充成功`);
                        } else {
                            logger.error(`  ❌ 题目 ${error.questionId} - 填充失败`);
                        }
                        
                        return { questionId: error.questionId, filled, newAnswer };
                    } catch (err) {
                        logger.error(`  ❌ 题目 ${error.questionId} - 处理失败:`, err);
                        return { questionId: error.questionId, filled: false, error: err };
                    }
                });

                // 等待所有填充完成
                const fillResults = await Promise.all(fillPromises);
                const successFills = fillResults.filter(r => r.filled).length;
                logger.info(`[Correction] 填充完成: ${successFills}/${remainingErrors.length}`);

                // 2. 等待平台自动保存
                logger.info('[Correction] ⏳ 等待平台自动保存...');
                await sleep(3000);

                // 3. 拉取批改结果验证
                logger.info('[Correction] 📡 拉取批改结果验证...');
                const verifyResult = await this._fetchErrorsFromPlatform();
                
                // 筛选客观题错题
                const stillWrongAll = verifyResult.filter(err => 
                    ['0', '1', '2', '3'].includes(err.questionType?.toString()) && 
                    err.correct === false
                );
                
                logger.info(`[Correction] 验证结果: 剩余错题 ${stillWrongAll.length} 道`);

                // 4. 对比哪些题纠正成功了
                const stillWrongIds = new Set(stillWrongAll.map(e => e.questionId));
                
                remainingErrors.forEach(error => {
                    if (!stillWrongIds.has(error.questionId)) {
                        // 这道题已经不在错题列表中了，说明纠正成功
                        const correctAnswer = error.attemptedAnswers[error.attemptedAnswers.length - 1];
                        
                        finalResults.push({
                            questionId: error.questionId,
                            success: true,
                            attempts: attempt,
                            finalAnswer: correctAnswer
                        });
                        
                        logger.info(`  ✅ 题目 ${error.questionId} - 纠错成功！`);
                        
                        // 🔥 上传正确答案到云端（异步，不阻塞）
                        this._uploadCorrectAnswer(error, correctAnswer).catch(err => {
                            logger.warn(`  ⚠️ 题目 ${error.questionId} - 上传答案失败:`, err);
                        });
                    }
                });

                // 5. 更新剩余错题列表（仍然错误的题目）
                remainingErrors = stillWrongAll.map(wrongErr => {
                    // 找到原始错题对象，保留 attemptedAnswers
                    const originalError = remainingErrors.find(e => e.questionId === wrongErr.questionId);
                    if (originalError) {
                        return {
                            ...wrongErr,
                            attemptedAnswers: originalError.attemptedAnswers || []
                        };
                    }
                    return wrongErr;
                });

                if (remainingErrors.length > 0) {
                    logger.warn(`[Correction] ⚠️ 第 ${attempt} 轮后仍有 ${remainingErrors.length} 道题错误`);
                    remainingErrors.forEach(err => {
                        logger.warn(`  - 题目 ${err.questionId} (类型${err.questionType}): 已尝试 [${err.attemptedAnswers?.join(', ')}]`);
                    });
                }

                await sleep(500); // 稍微延迟
            }

            // 6. 处理最终仍然失败的题目
            remainingErrors.forEach(error => {
                finalResults.push({
                    questionId: error.questionId,
                    success: false,
                    attempts: attempt,
                    attemptedAnswers: error.attemptedAnswers || [],
                    message: `已尝试 ${attempt} 次，答案均被判定错误`
                });
                logger.error(`\n❌ 题目 ${error.questionId} 纠错失败！`);
                logger.error(`   题型: ${error.questionType}`);
                logger.error(`   内容: ${error.content?.substring(0, 50)}...`);
                logger.error(`   已尝试: ${error.attemptedAnswers?.join(', ')}`);
                logger.error(`   建议: 请检查题目要求或手动修改`);
            });

            // 7. 统计结果
            const successCount = finalResults.filter(r => r.success).length;
            const failedCount = finalResults.filter(r => !r.success).length;
            
            logger.info(`\n[Correction] ✅ 纠错完成！`);
            logger.info(`[Correction] 成功: ${successCount}/${errors.length}`);
            logger.info(`[Correction] 失败: ${failedCount}/${errors.length}`);
            logger.info(`[Correction] 总尝试轮数: ${attempt}`);

            return {
                total: errors.length,
                success: successCount,
                failed: failedCount,
                attempts: attempt,
                results: finalResults
            };

        } catch (error) {
            logger.error('[Correction] 纠错失败:', error);
            throw error;
        } finally {
            this.correcting = false;
        }
    }


    /**
     * 选择纠错策略
     * @private
     */
    _selectStrategy(questionType, error) {
        const { attemptCount = 0 } = error;

        switch (questionType) {
            case QUESTION_TYPES.DANXUAN:
                // 单选: 第1-2次排除法, 第3次AI
                return attemptCount < 2
                    ? CORRECTION_STRATEGIES.ELIMINATION
                    : CORRECTION_STRATEGIES.AI_CORRECTION;

            case QUESTION_TYPES.DUOXUAN:
                // 多选: AI辅助排除法
                return CORRECTION_STRATEGIES.AI_ASSISTED;

            case QUESTION_TYPES.PANDUAN:
                // 判断: 直接切换
                return CORRECTION_STRATEGIES.TOGGLE;

            case QUESTION_TYPES.TIANKONG:
            case QUESTION_TYPES.JIANDA:
                // 填空/简答: AI纠错
                return CORRECTION_STRATEGIES.AI_CORRECTION;

            default:
                return CORRECTION_STRATEGIES.AI_CORRECTION;
        }
    }

    /**
     * 排除法纠错 (单选题)
     * @private
     */
    async _eliminationCorrection(error) {
        const { wrongAnswer, options } = error;

        if (!options || options.length === 0) {
            return null;
        }

        // 排除错误答案，随机选择其他选项
        const availableOptions = options.filter(opt => opt !== wrongAnswer);

        if (availableOptions.length === 0) {
            return null;
        }

        // 随机选择一个
        const randomIndex = Math.floor(Math.random() * availableOptions.length);
        return availableOptions[randomIndex];
    }

    /**
     * 切换纠错 (判断题)
     * @private
     */
    async _toggleCorrection(error) {
        const { wrongAnswer } = error;

        // 对 ↔ 错
        return wrongAnswer === '对' ? '错' : '对';
    }

    /**
     * AI纠错（携带已尝试答案）
     * @private
     */
    async _aiCorrection(error) {
        const { content, questionType, options, attemptedAnswers } = error;

        try {
            // 构建提示词，包含已尝试的错误答案
            let promptContent = content;
            if (attemptedAnswers && attemptedAnswers.length > 0) {
                promptContent += `\n\n注意：以下答案已被证明是错误的，请避免重复：${attemptedAnswers.join(', ')}`;
                promptContent += '\n请给出标准答案，注意区分大小写、空格和标点符号。';
            }

            const answer = await APIClient.aiAnswer(
                promptContent,
                questionType,
                options || [],
                attemptedAnswers  // 传递已尝试答案
            );

            logger.info(`[Correction] AI给出新答案: ${answer}`);
            return answer;
        } catch (err) {
            logger.error('[Correction] AI纠错失败:', err);
            return null;
        }
    }

    /**
     * AI辅助排除法 (多选题)
     * @private
     */
    async _aiAssistedElimination(error) {
        // 组合使用排除法和AI
        // 先用AI重新答题
        return await this._aiCorrection(error);
    }

    /**
     * 批量上传正确答案到云端
     * @private
     * @param {Array} correctQuestions - 正确的题目列表
     */
    async _uploadCorrectQuestions(correctQuestions) {
        try {
            // 过滤已上传的题目
            const newQuestions = correctQuestions.filter(q => !this.uploadedQuestions.has(q.questionId));
            
            if (newQuestions.length === 0) {
                logger.info('[Correction] 所有题目均已上传过，跳过');
                return;
            }
            
            const skippedCount = correctQuestions.length - newQuestions.length;
            if (skippedCount > 0) {
                logger.info(`[Correction] 跳过${skippedCount}道已上传题目`);
            }
            
            logger.info(`[Correction] 🚀 开始批量上传 ${newQuestions.length} 道正确答案...`);
            
            let successCount = 0;
            let failedCount = 0;

            // 并发上传，控制并发数为5
            const batchSize = 5;
            for (let i = 0; i < newQuestions.length; i += batchSize) {
                const batch = newQuestions.slice(i, i + batchSize);
                
                const results = await Promise.allSettled(
                    batch.map(q => this._uploadSingleCorrectAnswer(q))
                );

                results.forEach((result, index) => {
                    const question = batch[index];
                    if (result.status === 'fulfilled' && result.value) {
                        successCount++;
                        // 记录已上传
                        this.uploadedQuestions.add(question.questionId);
                    } else {
                        failedCount++;
                        logger.warn(`  ⚠️ 上传失败: ${question.questionId}`);
                    }
                });

                // 避免请求过快
                if (i + batchSize < newQuestions.length) {
                    await sleep(200);
                }
            }

            logger.info(`[Correction] ✅ 批量上传完成 - 成功: ${successCount}, 失败: ${failedCount}`);
            
        } catch (error) {
            logger.error('[Correction] 批量上传异常:', error);
        }
    }

    /**
     * 上传单个正确答案
     * @private
     */
    async _uploadSingleCorrectAnswer(question) {
        try {
            const { questionId, questionType, content, options, correctAnswer } = question;

            // 使用数据转换器转换格式
            const platformData = {
                questionId: questionId,
                questionContent: content,
                questionType: questionType,
                options: options,
                answer: correctAnswer
            };

            const uploadData = DataTransformer.platformToDatabase(platformData);

            if (!uploadData) {
                throw new Error('数据转换失败');
            }

            // 设置额外信息
            uploadData.confidence = 1.0; // 经过平台验证，置信度最高
            uploadData.source = 'platform_verified'; // 来源：平台批改验证

            // 验证数据完整性
            if (!DataTransformer.validateDatabaseFormat(uploadData)) {
                throw new Error('数据格式验证失败');
            }

            // 清理数据
            const cleanData = DataTransformer.cleanData(uploadData);

            // 上传到云端
            const success = await APIClient.upload(cleanData);

            if (success) {
                logger.debug(`  💾 ${questionId} - 已上传`);
            }

            return success;
        } catch (err) {
            logger.debug(`  ❌ ${question.questionId} - 上传失败:`, err.message);
            return false;
        }
    }

    /**
     * 上传正确答案到云端（纠错成功后）
     * @private
     * @param {object} error - 错题对象
     * @param {string} correctAnswer - 纠错成功的正确答案
     */
    async _uploadCorrectAnswer(error, correctAnswer) {
        try {
            logger.debug(`[Correction] 准备上传正确答案: ${error.questionId}`);

            // 使用数据转换器转换格式
            const uploadData = DataTransformer.extractCorrectAnswerFromCorrectionResult(
                error,
                correctAnswer
            );

            if (!uploadData) {
                throw new Error('数据转换失败');
            }

            // 验证数据完整性
            if (!DataTransformer.validateDatabaseFormat(uploadData)) {
                throw new Error('数据格式验证失败');
            }

            // 清理数据
            const cleanData = DataTransformer.cleanData(uploadData);

            logger.debug(`[Correction] 上传数据:`, cleanData);

            // 上传到云端
            const success = await APIClient.upload(cleanData);

            if (success) {
                logger.info(`  💾 题目 ${error.questionId} - 正确答案已上传到云端`);
                logger.info(`     答案: ${correctAnswer}`);
            }

            return success;
        } catch (err) {
            logger.error(`[Correction] 上传正确答案失败: ${error.questionId}`, err);
            throw err;
        }
    }

    /**
     * 获取纠错历史
     * @param {number} limit - 返回数量限制
     * @returns {Array} 历史记录
     */
    getHistory(limit = 10) {
        return this.correctionHistory.slice(-limit);
    }

    /**
     * 清空历史
     */
    clearHistory() {
        this.correctionHistory = [];
    }

    /**
     * 获取批改结果统计（公开方法）
     * @returns {Promise<object>} 批改结果统计
     */
    async fetchExamStatistics() {
        try {
            logger.info('[Correction] 📊 获取批改结果统计...');
            
            // 调用批改接口（会自动上传正确答案）
            const errors = await this._fetchErrorsFromAPI();
            
            // 返回统计信息
            return {
                total: this.latestTotalCount,
                correct: this.latestCorrectCount,
                wrong: errors.length,
                accuracy: this.latestTotalCount > 0 
                    ? Math.round((this.latestCorrectCount / this.latestTotalCount) * 100) 
                    : 0,
                uploaded: this.latestCorrectCount,  // 已上传的正确答案数量
                errors: errors
            };
            
        } catch (error) {
            logger.error('[Correction] 获取批改统计失败:', error);
            throw error;
        }
    }

    /**
     * 获取纠错统计
     * @returns {object} 统计信息
     */
    getStats() {
        const total = this.correctionHistory.length;
        const byStrategy = {};

        for (const record of this.correctionHistory) {
            const strategy = record.strategy;
            byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
        }

        return {
            total,
            byStrategy
        };
    }
}

// 导出单例
export default new CorrectionManager();
