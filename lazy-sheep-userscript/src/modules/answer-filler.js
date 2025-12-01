/**
 * 懒羊羊自动化平台 - 答案填充模块
 * @author 懒羊羊
 * 
 * 🔍 关键策略（基于实际测试）:
 * - 只操作DOM元素
 * - 让Vue自动监听变化
 * - 让平台自动处理格式转换和网络请求
 * 
 * 不要:
 * ❌ 手动转换答案格式
 * ❌ 手动设置Vue数据（多选题除外）
 * ❌ 手动发送网络请求
 * 
 * 应该:
 * ✅ 点击DOM元素（radio, checkbox）
 * ✅ 设置input.value
 * ✅ 使用KindEditor API
 */

import { QUESTION_TYPES, DELAY_CONFIG } from '../core/constants.js';
import { sleep, logger, removeFillBrackets } from '../core/utils.js';
import VueUtils from '../core/vue-utils.js';
import KindEditorHelper from './kindeditor-helper.js';
import SELECTORS from '../platforms/czbk/selectors.js';

class AnswerFiller {
    /**
     * 填充单选题答案
     * 
     * 实际测试发现:
     * - Vue数据: "A", "B", "C", "D" (字母)
     * - Radio value: "A", "B", "C", "D" (字母)
     * - 点击radio后，Vue自动更新stuAnswer
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string} answer - 答案（支持字母或索引）
     * @returns {Promise<boolean>} 是否成功
     */
    async fillDanxuan(questionItem, answer) {
        try {
            // 转换为字母格式
            const letter = this._convertToLetter(answer);

            // 查找所有radio
            const radios = questionItem.querySelectorAll(SELECTORS.radio);

            if (radios.length === 0) {
                logger.warn(`[单选题] 未找到radio选项`);
                return false;
            }

            // 尝试两种匹配方式
            let targetRadio = null;
            
            // 方式1: 匹配字母值 (Ant Design Vue格式: value="A")
            targetRadio = Array.from(radios).find(r => r.value === letter);
            
            // 方式2: 匹配索引值 (Element UI格式: value="0", "1", "2"...)
            if (!targetRadio) {
                const index = letter.charCodeAt(0) - 65; // A=0, B=1, C=2...
                targetRadio = Array.from(radios).find(r => r.value === String(index));
            }

            if (!targetRadio) {
                logger.warn(`[单选题] 未找到选项: ${letter} (尝试了字母值和索引值)`);
                return false;
            }

            // 点击radio，Vue会自动更新stuAnswer
            targetRadio.click();

            await sleep(DELAY_CONFIG.CLICK);

            logger.info(`[单选题] 填充成功: ${letter}`);
            return true;

        } catch (error) {
            logger.error('[单选题] 填充失败:', error);
            return false;
        }
    }

    /**
     * 填充多选题答案
     * 
     * 实际测试发现:
     * - Vue数据: ['null', 'A', 'B'] (数组，第一个是字符串'null')
     * - 点击checkbox后，Vue自动更新数组
     * - 不需要手动设置Vue数据
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string|Array} answer - 答案（"A,B,C" 或 ["A","B","C"]）
     * @returns {Promise<boolean>} 是否成功
     */
    async fillDuoxuan(questionItem, answer) {
        try {
            // 解析答案为字母数组
            const letters = this._parseMultipleAnswer(answer);
            
            // 警告：多选题只有一个答案
            if (letters.length === 1) {
                logger.warn(`[多选题] ⚠️ 警告：多选题只有1个答案 "${letters[0]}"，这可能是题库错误！`);
                logger.warn(`[多选题] 原始答案: ${JSON.stringify(answer)}`);
            }

            // 查找所有checkbox
            const checkboxes = questionItem.querySelectorAll(SELECTORS.checkbox);

            // 转换字母为索引
            const targetIndexes = new Set(
                letters.map(letter => letter.charCodeAt(0) - 65)
            );

            // 只点击需要改变状态的checkbox
            for (let i = 0; i < checkboxes.length; i++) {
                const shouldCheck = targetIndexes.has(i);
                const isChecked = checkboxes[i].checked;

                if (shouldCheck !== isChecked) {
                    // 点击checkbox，Vue会自动更新数组
                    checkboxes[i].click();
                    await sleep(DELAY_CONFIG.CLICK);
                }
            }

            logger.info(`[多选题] 填充成功: ${letters.join(',')}`);
            return true;

        } catch (error) {
            logger.error('[多选题] 填充失败:', error);
            return false;
        }
    }

    /**
     * 填充判断题答案
     * 
     * 实际测试发现:
     * - Vue数据: "对" 或 "错" (中文)
     * - 与单选题处理方式类似
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string} answer - 答案（"对"/"错" 或其他格式）
     * @returns {Promise<boolean>} 是否成功
     */
    async fillPanduan(questionItem, answer) {
        try {
            // 转换为中文"对"/"错"
            const normalizedAnswer = this._normalizeJudgmentAnswer(answer);

            // 查找所有radio
            const radios = questionItem.querySelectorAll(SELECTORS.radio);

            // 找到value匹配的radio
            const targetRadio = Array.from(radios).find(r =>
                r.value === normalizedAnswer
            );

            if (!targetRadio) {
                logger.warn(`[判断题] 未找到选项: ${normalizedAnswer}`);
                return false;
            }

            // 点击radio
            targetRadio.click();

            await sleep(DELAY_CONFIG.CLICK);

            logger.info(`[判断题] 填充成功: ${normalizedAnswer}`);
            return true;

        } catch (error) {
            logger.error('[判断题] 填充失败:', error);
            return false;
        }
    }

    /**
     * 填充填空题答案
     * 
     * 实际测试发现:
     * - Vue数据: 普通字符串
     * - 设置input.value后触发input事件
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string} answer - 答案
     * @returns {Promise<boolean>} 是否成功
     */
    async fillTiankong(questionItem, answer) {
        try {
            // 查找填空输入框
            const input = questionItem.querySelector(SELECTORS.fillInput);

            if (!input) {
                logger.warn('[填空题] 未找到输入框');
                return false;
            }

            // 清理答案中的括号（【】和[]）
            const cleanedAnswer = removeFillBrackets(answer);

            // 设置值
            input.value = cleanedAnswer;

            // 触发input事件，让Vue监听到变化
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            await sleep(DELAY_CONFIG.ANSWER_FILL);

            logger.info(`[填空题] 填充成功: ${cleanedAnswer.substring(0, 20)}...`);
            return true;

        } catch (error) {
            logger.error('[填空题] 填充失败:', error);
            return false;
        }
    }

    /**
     * 填充简答题答案
     * 
     * 实际测试发现:
     * - Vue数据: HTML格式字符串
     * - textarea.value为空（由KindEditor管理）
     * - 使用KindEditor API设置内容
     * 
     * @param {Element} questionItem - 题目元素
     * @param {string} answer - HTML格式答案
     * @returns {Promise<boolean>} 是否成功
     */
    async fillJianda(questionItem, answer) {
        try {
            const editorBox = questionItem.querySelector('.editor-box');
            if (!editorBox) {
                logger.error('[简答题] 未找到编辑器容器');
                return false;
            }

            // 方法1: 直接操作iframe编辑器（最可靠）
            const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
            if (iframe) {
                try {
                    logger.debug('[简答题] 找到iframe编辑器，开始填充...');
                    
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const iframeBody = iframeDoc.body;
                    
                    if (iframeBody) {
                        // 直接设置body内容
                        iframeBody.innerHTML = answer;
                        
                        // 触发iframe的事件
                        ['input', 'keyup', 'keydown', 'blur', 'change'].forEach(eventType => {
                            const evt = new Event(eventType, { bubbles: true, cancelable: true });
                            iframeBody.dispatchEvent(evt);
                            iframeDoc.dispatchEvent(evt);
                        });
                        
                        // 同步到textarea
                        const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                        if (textarea) {
                            textarea.value = answer;
                            ['input', 'change'].forEach(eventType => {
                                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 触发KindEditor容器事件
                        const keContainer = editorBox.querySelector('.ke-container');
                        if (keContainer) {
                            ['sync', 'change'].forEach(eventType => {
                                keContainer.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 尝试更新Vue数据
                        VueUtils.updateData(questionItem, 'stuAnswer', answer);
                        
                        await sleep(DELAY_CONFIG.ANSWER_FILL);
                        
                        // 验证填充是否成功
                        const finalContent = (iframeBody.textContent || iframeBody.innerText || '').trim();
                        if (finalContent) {
                            logger.info('[简答题] iframe编辑器填充成功');
                            return true;
                        }
                    }
                } catch (error) {
                    logger.warn('[简答题] iframe访问失败，尝试其他方法:', error.message);
                }
            }

            // 方法2: 使用KindEditor API
            if (KindEditorHelper.isAvailable()) {
                const editor = KindEditorHelper.findEditorByQuestion(questionItem);
                if (editor) {
                    const success = KindEditorHelper.setContent(editor, answer);
                    if (success) {
                        VueUtils.updateData(questionItem, 'stuAnswer', answer);
                        await sleep(DELAY_CONFIG.ANSWER_FILL);
                        logger.info('[简答题] KindEditor API填充成功');
                        return true;
                    }
                }
            }

            // 方法3: textarea降级方案
            logger.warn('[简答题] 使用textarea降级方案');
            const textarea = editorBox.querySelector('textarea.ke-edit-textarea') || 
                           questionItem.querySelector(SELECTORS.textarea);
            
            if (!textarea) {
                logger.error('[简答题] 未找到textarea');
                return false;
            }

            textarea.value = answer;
            ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
            });
            
            VueUtils.updateData(questionItem, 'stuAnswer', answer);
            await sleep(DELAY_CONFIG.ANSWER_FILL);
            
            logger.info('[简答题] textarea填充成功');
            return true;

        } catch (error) {
            logger.error('[简答题] 填充失败:', error);
            return false;
        }
    }

    /**
     * 统一填充接口
     * @param {Element} questionItem - 题目元素
     * @param {string} answer - 答案
     * @param {string} type - 题型（可选，自动检测）
     * @returns {Promise<boolean>} 是否成功
     */
    async fill(questionItem, answer, type = null) {
        // 自动检测题型
        if (!type) {
            const data = VueUtils.getQuestionData(questionItem);
            type = data?.questionType?.toString() || QUESTION_TYPES.DANXUAN;
        }

        // 根据题型调用对应方法
        switch (type) {
            case QUESTION_TYPES.DANXUAN:
                return await this.fillDanxuan(questionItem, answer);

            case QUESTION_TYPES.DUOXUAN:
                return await this.fillDuoxuan(questionItem, answer);

            case QUESTION_TYPES.PANDUAN:
                return await this.fillPanduan(questionItem, answer);

            case QUESTION_TYPES.TIANKONG:
                return await this.fillTiankong(questionItem, answer);

            case QUESTION_TYPES.JIANDA:
                return await this.fillJianda(questionItem, answer);

            default:
                logger.error(`[答案填充] 未知题型: ${type}`);
                return false;
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 转换为字母格式
     * @private
     */
    _convertToLetter(answer) {
        answer = String(answer).trim().toUpperCase();

        // 如果已经是字母，直接返回
        if (/^[A-Z]$/.test(answer)) {
            return answer;
        }

        // 如果是数字索引，转换为字母
        const index = parseInt(answer);
        if (!isNaN(index) && index >= 0) {
            return String.fromCharCode(65 + index);
        }

        // 默认返回A
        return 'A';
    }

    /**
     * 解析多选题答案
     * @private
     */
    _parseMultipleAnswer(answer) {
        // 如果已经是数组
        if (Array.isArray(answer)) {
            return answer.map(a => this._convertToLetter(a));
        }

        // 如果是逗号分隔的字符串
        return String(answer)
            .split(/[,，]/)
            .map(a => this._convertToLetter(a))
            .filter(Boolean);
    }

    /**
     * 规范化判断题答案
     * @private
     */
    _normalizeJudgmentAnswer(answer) {
        answer = String(answer).trim();

        // 真值列表
        const trueValues = ['对', '正确', 'true', '1', 'T', 'TRUE', '✓'];
        const falseValues = ['错', '错误', 'false', '0', 'F', 'FALSE', '✗'];

        if (trueValues.some(v => answer.includes(v))) {
            return '对';
        }

        if (falseValues.some(v => answer.includes(v))) {
            return '错';
        }

        // 默认返回"对"
        return '对';
    }
}

// 导出单例
export default new AnswerFiller();
