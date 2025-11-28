// ==UserScript==
// @name         传智播客答题脚本|刷课脚本|AI答题|Vue3+ElementPlus
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  传智播客自动答题、刷课、AI答题一体化脚本。支持本地答案库（GM_getValue）、云端API查询、AI答题。使用Vue3+ElementPlus现代化UI
// @author       CZBK Team
// @match        https://stu.ityxb.com/*
// @require      https://lib.baomitu.com/vue/3.5.0/vue.global.prod.js
// @require      https://lib.baomitu.com/vue-demi/0.14.7/index.iife.js
// @require      data:application/javascript,window.Vue%3DVue%3B
// @require      https://lib.baomitu.com/element-plus/2.7.2/index.full.min.js
// @resource     ElementPlusCSS https://lib.baomitu.com/element-plus/2.7.2/index.css
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const config = {
        // API配置
        api: {
            baseUrl: 'http://localhost:8000',  // 本地开发使用localhost，部署后改为服务器地址
            searchEndpoint: '/api/search',
            aiEndpoint: '/api/ai/answer',
            keyInfoEndpoint: '/api/key/info'
        },
        
        // 功能开关
        features: {
            autoAnswer: false,        // 自动答题（默认关闭）
            autoSubmit: false,        // 自动提交（默认关闭）
            skipAnswered: true,       // 跳过已答题
            useAI: true,              // 启用AI答题
            showControlPanel: true,   // 显示控制面板
            useVueUI: true           // 使用Vue3 + Antdv UI
        },
        
        // 答题配置
        answer: {
            delay: 500,              // 答题延迟（毫秒）
            retryCount: 3,           // 重试次数
            retryDelay: 1000,        // 重试延迟
            answerInterval: 1        // 答题间隔（秒）
        },
        
        // AI配置
        ai: {
            enabled: true,
            timeout: 30000,
            model: 'gpt-3.5-turbo',
            temperature: 0.3
        },
        
        // 正确率配置
        correctRate: {
            threshold: 85,          // 正确率阈值（%）
            autoSubmit: true         // 达到阈值自动提交
        }
    };

    // ==================== 全局变量 ====================
    let apiKey = GM_getValue('czbk_api_key', '');
    let answerDB = {};  // 本地答案库（从GM_getValue加载）
    let answerLogs = [];  // 答题日志
    let isInitialized = false;
    let correctNum = 0;  // 正确答题数

    // ==================== 工具函数 ====================
    const utils = {
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

        log: function(...args) {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            const logEntry = {
                time: new Date().toLocaleTimeString(),
                message: message,
                type: 'info'
            };
            
            answerLogs.unshift(logEntry);
            if (answerLogs.length > 100) {
                answerLogs = answerLogs.slice(0, 100);
            }
            
            console.log('[传智播客脚本]', ...args);
            
            // 更新控制面板日志显示
            if (typeof controlPanel !== 'undefined' && controlPanel.updateLogs) {
                controlPanel.updateLogs();
            }
        },

        getQuestionId: (element) => {
            return element.getAttribute('data-id') || 
                   element.closest('[data-id]')?.getAttribute('data-id') || 
                   null;
        },

        getQuestionText: (element) => {
            const titleBox = element.querySelector('.question-title-box .myEditorTxt');
            return titleBox ? titleBox.textContent.trim() : '';
        },

        getQuestionType: (element) => {
            // 优先从data-type属性获取
            const dataType = element.getAttribute('data-type') || 
                           element.closest('[data-type]')?.getAttribute('data-type');
            if (dataType) {
                return dataType;
            }
            
            // 从父容器判断（传智播客的题型容器）
            const parent = element.closest('#danxuanQuestionBox, #duoxuanQuestionBox, #panduanQuestionBox, #tiankongQuestionBox, #jiandaQuestionBox');
            if (parent) {
                if (parent.id === 'danxuanQuestionBox') return '0';
                if (parent.id === 'duoxuanQuestionBox') return '1';
                if (parent.id === 'panduanQuestionBox') return '2';
                if (parent.id === 'tiankongQuestionBox') return '3';
                if (parent.id === 'jiandaQuestionBox') return '4';
            }
            
            // 从DOM结构判断
            const radio = element.querySelector('input[type="radio"]');
            const checkbox = element.querySelector('input[type="checkbox"]');
            const fillInput = element.querySelector('input.tk_input');
            const editor = element.querySelector('.editor-box');
            
            if (checkbox) return '1';  // 多选
            if (radio) {
                const radioCount = element.querySelectorAll('input[type="radio"]').length;
                return radioCount === 2 ? '2' : '0';  // 判断或单选
            }
            if (fillInput) return '3';  // 填空
            if (editor) return '4';     // 简答
            return '0';
        },

        isQuestionAnswered: (questionItem) => {
            const checkedRadio = questionItem.querySelector('input[type="radio"]:checked');
            const checkedCheckbox = questionItem.querySelector('input[type="checkbox"]:checked');
            const fillInputs = questionItem.querySelectorAll('input.tk_input[data-questionid]');
            const editorBox = questionItem.querySelector('.editor-box');
            
            if (checkedRadio || checkedCheckbox) return true;
            
            for (const input of fillInputs) {
                if (input.value && input.value.trim()) return true;
            }
            
            if (editorBox) {
                const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                if (textarea && textarea.value && textarea.value.trim()) return true;
            }
            
            return false;
        },

        request: function(options) {
            return new Promise((resolve, reject) => {
                const defaultOptions = {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                };

                if (apiKey) {
                    defaultOptions.headers['X-API-Key'] = apiKey;
                }

                const finalOptions = Object.assign({}, defaultOptions, options);
                
                if (finalOptions.data) {
                    finalOptions.data = JSON.stringify(finalOptions.data);
                }

                GM_xmlhttpRequest({
                    ...finalOptions,
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (response.status >= 200 && response.status < 300) {
                                resolve(data);
                            } else {
                                reject(new Error(data.detail || `HTTP ${response.status}`));
                            }
                        } catch (e) {
                            reject(new Error('解析响应失败'));
                        }
                    },
                    onerror: reject,
                    ontimeout: () => reject(new Error('请求超时'))
                });
            });
        }
    };

    // ==================== 答案库管理（GM_getValue） ====================
    const answerDBManager = {
        load: function() {
            try {
                const stored = GM_getValue('czbk_answer_db', null);
                if (stored) {
                    answerDB = stored;
                    utils.log(`从本地缓存加载答案库，共 ${Object.keys(answerDB).length} 条记录`);
                } else {
                    answerDB = {};
                    utils.log('本地缓存为空，答案库未初始化');
                }
            } catch (e) {
                utils.log('加载答案库失败:', e);
                answerDB = {};
            }
        },

        save: function() {
            try {
                GM_setValue('czbk_answer_db', answerDB);
                utils.log('答案库已保存到本地缓存');
            } catch (e) {
                utils.log('保存答案库失败:', e);
            }
        },

        merge: function(data) {
            let count = 0;
            if (Array.isArray(data)) {
                data.forEach(item => {
                    const id = item.id || item.questionId;
                    if (id) {
                        answerDB[id] = item;
                        count++;
                    }
                });
            } else if (typeof data === 'object') {
                for (const key in data) {
                    const item = data[key];
                    const id = item.id || item.questionId || key;
                    answerDB[id] = item;
                    count++;
                }
            }
            this.save();
            utils.log(`已合并 ${count} 条答案记录`);
            return count;
        },

        importJSON: function(jsonData) {
            try {
                const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
                const count = this.merge(data);
                return { success: true, count: count };
            } catch (e) {
                utils.log('导入JSON失败:', e);
                return { success: false, error: e.message };
            }
        },

        exportJSON: function() {
            try {
                return JSON.stringify(answerDB, null, 2);
            } catch (e) {
                utils.log('导出JSON失败:', e);
                return null;
            }
        },

        add: function(questionId, questionData) {
            const id = questionId || questionData.id || questionData.questionId;
            if (id) {
                answerDB[id] = questionData;
                this.save();
                return true;
            }
            return false;
        },

        search: function(questionId, questionText) {
            // 优先使用questionId精确匹配
            if (questionId) {
                const item = answerDB[questionId];
                if (item) {
                    return {
                        found: true,
                        answer: item.answer,
                        solution: item.solution,
                        source: 'local'
                    };
                }
            }

            // 文本匹配
            if (questionText) {
                const searchText = questionText.substring(0, 30);
                for (const key in answerDB) {
                    const item = answerDB[key];
                    const content = item.questionContent || '';
                    if (content && (content.includes(searchText) || searchText.includes(content.substring(0, 30)))) {
                        return {
                            found: true,
                            answer: item.answer,
                            solution: item.solution,
                            source: 'local-text'
                        };
                    }
                }
            }

            return { found: false };
        },

        getStats: function() {
            const stats = {
                total: Object.keys(answerDB).length,
                byType: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
            };
            for (const key in answerDB) {
                const item = answerDB[key];
                const type = item.type || item.questionType || '0';
                if (stats.byType[type] !== undefined) {
                    stats.byType[type]++;
                }
            }
            return stats;
        },

        clear: function() {
            answerDB = {};
            this.save();
            utils.log('答案库已清空');
        }
    };

    // ==================== API查询模块 ====================
    const apiQuery = {
        search: async function(questionData) {
            if (!apiKey) {
                throw new Error('未配置API Key');
            }

            try {
                const response = await utils.request({
                    method: 'POST',
                    url: `${config.api.baseUrl}${config.api.searchEndpoint}`,
                    data: {
                        questionId: questionData.questionId,
                        questionContent: questionData.questionText,
                        type: questionData.questionType,
                        platform: 'czbk',
                        options: questionData.options
                    }
                });

                if (response.code === 1 && response.data) {
                    return {
                        found: response.data.found || true,
                        answer: response.data.answer || [],
                        solution: response.data.solution,
                        confidence: response.data.confidence,
                        source: response.data.source || 'api'
                    };
                }
                
                return {
                    found: false,
                    answer: null,
                    solution: null,
                    confidence: 0,
                    source: 'api'
                };
            } catch (e) {
                utils.log('API查询失败:', e);
                throw e;
            }
        },

        aiAnswer: async function(questionData) {
            if (!apiKey) {
                throw new Error('未配置API Key');
            }

            if (!config.features.useAI) {
                throw new Error('AI功能未启用');
            }

            try {
                const response = await utils.request({
                    method: 'POST',
                    url: `${config.api.baseUrl}${config.api.aiEndpoint}`,
                    data: {
                        questionContent: questionData.questionText,
                        type: questionData.questionType,
                        options: questionData.options,
                        platform: 'czbk'
                    },
                    timeout: config.ai.timeout
                });

                if (response.code === 1 && response.data) {
                    return {
                        found: true,
                        answer: response.data.answer || [],
                        solution: response.data.solution,
                        confidence: response.data.confidence || 0.8,
                        source: response.data.source || 'ai'
                    };
                }
                
                throw new Error(response.message || 'AI答题失败');
            } catch (e) {
                utils.log('AI答题失败:', e);
                throw e;
            }
        },

        getKeyInfo: async function() {
            if (!apiKey) {
                return null;
            }

            try {
                const response = await utils.request({
                    method: 'GET',
                    url: `${config.api.baseUrl}${config.api.keyInfoEndpoint}`
                });
                return response;
            } catch (e) {
                utils.log('查询Key信息失败:', e);
                return null;
            }
        }
    };

    // ==================== 答案填充模块 ====================
    const answerFiller = {
        fillDanxuan: async function(questionItem, answer) {
            const radio = questionItem.querySelector(`input[type="radio"][value="${answer}"]`);
            if (radio) {
                radio.click();
                await utils.sleep(config.answer.delay);
                return true;
            }
            return false;
        },

        fillDuoxuan: async function(questionItem, answers) {
            const questionId = utils.getQuestionId(questionItem);
            let answersArray = Array.isArray(answers) ? answers : [answers];
            
            // 处理字符串格式的答案，如 "ABC" 或 "A,B,C"
            if (typeof answers === 'string') {
                if (answers.includes(',') || answers.includes('，')) {
                    answersArray = answers.split(/[,，]/).map(a => a.trim().toUpperCase()).filter(a => a);
                } else {
                    answersArray = answers.toUpperCase().split('').filter(a => /[A-Z]/.test(a));
                }
            }
            
            // 将答案数组转换为字符串格式（网站代码期望字符串）
            const answerString = answersArray.join('');
            
            // 尝试找到并设置 Vue 数据（如果页面使用 Vue）
            let vueInstance = null;
            const possibleVueElements = [
                questionItem,
                questionItem.closest('.questionItem'),
                questionItem.closest('[data-v-]'),
                questionItem.parentElement
            ];
            
            for (const el of possibleVueElements) {
                if (el) {
                    vueInstance = el.__vue__ || el._vnode?.ctx || el.__vueParentScope;
                    if (vueInstance) break;
                }
            }
            
            // 设置 Vue 数据中的 stuAnswer 为字符串格式
            if (vueInstance) {
                try {
                    if (vueInstance.data) {
                        vueInstance.data.stuAnswer = answerString;
                    }
                    if (vueInstance.$data) {
                        vueInstance.$data.stuAnswer = answerString;
                    }
                    if (vueInstance.stuAnswer !== undefined) {
                        vueInstance.stuAnswer = answerString;
                    }
                } catch (e) {
                    utils.log('设置 Vue 数据时出错:', e);
                }
            }
            
            // 设置隐藏输入框的值
            const hiddenInputs = questionItem.querySelectorAll('input[type="hidden"]');
            hiddenInputs.forEach(input => {
                if (input.name && (input.name.includes('answer') || input.name.includes('stuAnswer'))) {
                    input.value = answerString;
                }
            });
            
            // 逐个点击复选框
            let successCount = 0;
            for (const answer of answersArray) {
                const checkbox = questionItem.querySelector(`input[type="checkbox"][value="${answer}"]`);
                if (checkbox) {
                    if (!checkbox.checked) {
                        // 先设置 checked 属性
                        checkbox.checked = true;
                        // 触发 change 事件
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        // 然后点击
                        checkbox.click();
                        await utils.sleep(100);
                        successCount++;
                        utils.log(`多选题已选择: ${answer}`);
                    } else {
                        successCount++; // 已经选中
                    }
                }
            }
            
            return successCount === answersArray.length;
        },

        fillPanduan: async function(questionItem, answer) {
            return await this.fillDanxuan(questionItem, answer);
        },

        fillTiankong: async function(questionItem, answers) {
            const inputs = questionItem.querySelectorAll('input.tk_input[data-questionid]');
            let successCount = 0;
            
            for (let i = 0; i < inputs.length && i < answers.length; i++) {
                const input = inputs[i];
                const answer = answers[i];
                input.value = answer;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                successCount++;
                await utils.sleep(config.answer.delay);
            }
            
            return successCount === answers.length;
        },

        fillJianda: async function(questionItem, answer) {
            // 等待一小段时间，确保编辑器已初始化
            await utils.sleep(100);

            const editorBox = questionItem.querySelector('.editor-box');
            if (!editorBox) {
                utils.log('未找到简答题编辑器');
                return false;
            }

            // 方法1: 尝试使用kindeditor的API（如果可用）
            const keContainer = editorBox.querySelector('.ke-container');
            if (keContainer) {
                try {
                    // 尝试通过jQuery获取kindeditor实例
                    if (typeof jQuery !== 'undefined' && jQuery(keContainer).data('kindeditor')) {
                        const editor = jQuery(keContainer).data('kindeditor');
                        if (editor && typeof editor.html === 'function') {
                            // 将换行符转换为 <br> 标签
                            const formattedAnswer = answer.replace(/\n/g, '<br>');
                            editor.html(formattedAnswer);
                            editor.sync();
                            await utils.sleep(200);
                            utils.log('简答题已填写（通过kindeditor API）');
                            return true;
                        }
                    }
                } catch (e) {
                    utils.log('使用kindeditor API失败:', e);
                }
            }

            // 方法2: 优先尝试操作 iframe 编辑器（kindeditor的主要编辑区域）
            const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
            if (iframe) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const iframeBody = iframeDoc.body;
                    if (iframeBody) {
                        // 将换行符转换为 <br> 标签以在富文本编辑器中正确显示
                        const formattedAnswer = answer.replace(/\n/g, '<br>');
                        
                        // 直接修改body的内容
                        iframeBody.innerHTML = formattedAnswer;
                        
                        // 在iframe的document上触发input事件
                        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                        iframeDoc.dispatchEvent(inputEvent);
                        iframeBody.dispatchEvent(inputEvent);
                        
                        // 触发其他可能需要的事件
                        ['keyup', 'keydown', 'blur', 'change'].forEach(eventType => {
                            const evt = new Event(eventType, { bubbles: true, cancelable: true });
                            iframeBody.dispatchEvent(evt);
                            iframeDoc.dispatchEvent(evt);
                        });
                        
                        // 尝试同步到textarea（kindeditor可能需要）
                        const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                        if (textarea) {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = formattedAnswer;
                            const plainText = tempDiv.textContent || tempDiv.innerText || answer;
                            textarea.value = plainText;
                            ['input', 'change'].forEach(eventType => {
                                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 尝试触发kindeditor的同步机制和父元素事件
                        if (keContainer) {
                            ['sync', 'change'].forEach(eventType => {
                                keContainer.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 在editorBox及其父元素上触发事件
                        let parent = editorBox;
                        for (let i = 0; i < 3 && parent; i++) {
                            ['input', 'change'].forEach(eventType => {
                                parent.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                            parent = parent.parentElement;
                        }
                        
                        await utils.sleep(300);
                        utils.log('简答题已填写（通过iframe）');
                        return true;
                    }
                } catch (e) {
                    utils.log('无法访问iframe编辑器:', e);
                }
            }

            // 方法3: 尝试查找并操作 textarea
            const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
            if (textarea) {
                textarea.value = answer;
                ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                    textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                });
                await utils.sleep(200);
                utils.log('简答题已填写（通过textarea）');
                return true;
            }
            
            // 方法4: 尝试查找其他可能的编辑器元素
            const contentEditable = editorBox.querySelector('[contenteditable="true"]');
            if (contentEditable) {
                const formattedAnswer = answer.replace(/\n/g, '<br>');
                contentEditable.innerHTML = formattedAnswer;
                ['input', 'change', 'blur'].forEach(eventType => {
                    contentEditable.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                });
                await utils.sleep(200);
                utils.log('简答题已填写（通过contentEditable）');
                return true;
            }

            utils.log('简答题填写失败：未找到可用的编辑器元素');
            return false;
        },

        fill: async function(questionItem, answer, questionType) {
            const answers = Array.isArray(answer) ? answer : [answer];
            
            switch(questionType) {
                case '0': return await this.fillDanxuan(questionItem, answers[0]);
                case '1': return await this.fillDuoxuan(questionItem, answers);
                case '2': return await this.fillPanduan(questionItem, answers[0]);
                case '3': return await this.fillTiankong(questionItem, answers);
                case '4': return await this.fillJianda(questionItem, answers.join('\n'));
                default: return false;
            }
        }
    };

    // ==================== 查询答案主流程 ====================
    const queryAnswer = {
        query: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            const questionText = utils.getQuestionText(questionItem);
            const questionType = utils.getQuestionType(questionItem);
            
            if (!questionText) {
                throw new Error('无法识别题目内容');
            }

            // 提取选项
            const options = [];
            const optionItems = questionItem.querySelectorAll('.question-option-item');
            optionItems.forEach(item => {
                const text = item.textContent.trim();
                if (text) options.push(text);
            });

            const questionData = {
                questionId,
                questionText,
                questionType,
                options
            };

            // 1. 优先查询本地库
            let result = answerDBManager.search(questionId, questionText);
            if (result.found) {
                utils.log('本地库找到答案');
                return { ...result, questionData };
            }

            // 2. 查询云端API
            try {
                result = await apiQuery.search(questionData);
                if (result.found) {
                    utils.log('云端API找到答案');
                    // 保存到本地库
                    answerDBManager.add(questionId, {
                        id: questionId,
                        questionId,
                        questionContent: questionText,
                        questionType,
                        options,
                        answer: result.answer,
                        solution: result.solution,
                        timestamp: Date.now()
                    });
                    return { ...result, questionData };
                }
            } catch (e) {
                utils.log('云端API查询失败，尝试AI答题:', e.message);
            }

            // 3. AI答题（如果启用）
            if (config.features.useAI) {
                try {
                    result = await apiQuery.aiAnswer(questionData);
                    if (result.found) {
                        utils.log('AI答题成功');
                        // 保存到本地库
                        answerDBManager.add(questionId, {
                            id: questionId,
                            questionId,
                            questionContent: questionText,
                            questionType,
                            options,
                            answer: result.answer,
                            solution: result.solution,
                            timestamp: Date.now()
                        });
                        return { ...result, questionData };
                    }
                } catch (e) {
                    utils.log('AI答题失败:', e.message);
                }
            }

            // 未找到答案
            return {
                found: false,
                questionData,
                message: '未找到答案'
            };
        },

        // 批量查询
        batchQuery: async function(questionItems) {
            const results = [];
            const total = questionItems.length;
            let foundCount = 0;
            
            for (let i = 0; i < questionItems.length; i++) {
                const item = questionItems[i];
                try {
                    utils.log(`查询进度: ${i + 1}/${total}`);
                    const result = await this.query(item);
                    results.push(result);
                    if (result.found) foundCount++;
                    await utils.sleep(config.answer.answerInterval * 1000);
                } catch (e) {
                    utils.log('查询失败:', e);
                    results.push({
                        found: false,
                        error: e.message
                    });
                }
            }
            
            utils.log(`批量查询完成: 共${total}题，找到${foundCount}题`);
            return results;
        }
    };

    // ==================== 刷课功能 ====================
    const courseAuto = {
        // 检测是否为视频页面
        isVideoPage: function() {
            return document.querySelector('.preview_play-container') !== null ||
                   document.querySelector('#videoPlayer') !== null ||
                   document.querySelector('.video-play-box') !== null ||
                   document.querySelector('video') !== null;
        },

        // 自动完成课程
        finishCourse: async function() {
            try {
                utils.log('开始自动完成课程...');
                
                // 1. 检查是否有finishWxCourse函数
                if (typeof window.finishWxCourse === 'function') {
                    utils.log('找到finishWxCourse函数，正在执行...');
                    window.finishWxCourse();
                    await utils.sleep(1000);
                    utils.log('finishWxCourse执行完成');
                    return true;
                }

                // 2. 尝试查找并点击完成按钮
                const finishSelectors = [
                    '.finish-btn',
                    '.complete-btn',
                    '[data-action="finish"]',
                    'button:contains("完成")',
                    'a:contains("完成")',
                    '.el-button--primary:contains("完成")'
                ];

                for (const selector of finishSelectors) {
                    try {
                        const btn = document.querySelector(selector);
                        if (btn && btn.offsetParent !== null) {
                            btn.click();
                            utils.log(`找到完成按钮并点击: ${selector}`);
                            await utils.sleep(1000);
                            return true;
                        }
                    } catch (e) {
                        // 忽略选择器错误
                    }
                }

                // 3. 尝试通过视频播放器完成
                const video = document.querySelector('video');
                if (video) {
                    // 快进到结尾
                    if (video.duration) {
                        video.currentTime = video.duration - 1;
                        await utils.sleep(1000);
                        utils.log('视频已快进到结尾');
                        
                        // 等待视频结束事件
                        return new Promise((resolve) => {
                            const onEnded = () => {
                                video.removeEventListener('ended', onEnded);
                                utils.log('视频播放完成');
                                resolve(true);
                            };
                            video.addEventListener('ended', onEnded);
                            
                            // 如果视频已经结束
                            if (video.ended) {
                                resolve(true);
                            }
                        });
                    }
                }

                utils.log('未找到完成课程的方法');
                return false;
            } catch (e) {
                utils.log('自动完成课程失败:', e);
                return false;
            }
        },

        // 自动播放视频
        autoPlay: async function() {
            const video = document.querySelector('video');
            if (video) {
                try {
                    if (video.paused) {
                        await video.play();
                    }
                    // 设置播放速度
                    video.playbackRate = 2.0;
                    utils.log('视频已开始播放，速度: 2.0x');
                    
                    // 监听视频结束
                    video.addEventListener('ended', () => {
                        utils.log('视频播放完成');
                        this.finishCourse();
                    }, { once: true });
                    
                    return true;
                } catch (e) {
                    utils.log('视频播放失败:', e);
                    return false;
                }
            }
            return false;
        }
    };

    // ==================== 批量自动答题 ====================
    const autoAnswer = {
        isRunning: false,
        correctNum: 0,
        totalNum: 0,

        start: async function() {
            if (this.isRunning) {
                utils.log('自动答题已在运行中');
                return;
            }

            this.isRunning = true;
            this.correctNum = 0;
            this.totalNum = 0;

            if (controlPanel) {
                controlPanel.updateStatus('答题中...');
            }
            utils.log('开始批量自动答题...');
            
            let answeredCount = 0;

            // 处理单选题（支持两种选择器）
            const danxuanSelectors = [
                '#danxuanQuestionBox .questionItem',
                '.question-item[data-type="0"]',
                '.question-item:has(input[type="radio"])'
            ];
            let danxuanItems = [];
            for (const selector of danxuanSelectors) {
                danxuanItems = document.querySelectorAll(selector);
                if (danxuanItems.length > 0) break;
            }
            
            for (const item of danxuanItems) {
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                const questionId = utils.getQuestionId(item);
                if (!questionId) continue;
                
                // 跳过已答题
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log('题目已答，跳过:', questionId);
                    continue;
                }
                
                // 查询答案
                const result = await queryAnswer.query(item);
                if (result.found) {
                    const success = await answerFiller.fillDanxuan(item, result.answer);
                    if (success) {
                        answeredCount++;
                        this.correctNum++;
                        utils.log(`单选题已选择: ${result.answer}`);
                    }
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }

            // 处理多选题
            const duoxuanSelectors = [
                '#duoxuanQuestionBox .questionItem',
                '.question-item[data-type="1"]',
                '.question-item:has(input[type="checkbox"])'
            ];
            let duoxuanItems = [];
            for (const selector of duoxuanSelectors) {
                duoxuanItems = document.querySelectorAll(selector);
                if (duoxuanItems.length > 0) break;
            }
            
            for (const item of duoxuanItems) {
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                const questionId = utils.getQuestionId(item);
                if (!questionId) continue;
                
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log('题目已答，跳过:', questionId);
                    continue;
                }
                
                const result = await queryAnswer.query(item);
                if (result.found) {
                    const answers = Array.isArray(result.answer) ? result.answer : [result.answer];
                    const success = await answerFiller.fillDuoxuan(item, answers);
                    if (success) {
                        answeredCount++;
                        this.correctNum++;
                        utils.log(`多选题已选择: ${answers.join(',')}`);
                    }
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }

            // 处理判断题
            const panduanSelectors = [
                '#panduanQuestionBox .questionItem',
                '.question-item[data-type="2"]'
            ];
            let panduanItems = [];
            for (const selector of panduanSelectors) {
                panduanItems = document.querySelectorAll(selector);
                if (panduanItems.length > 0) break;
            }
            
            for (const item of panduanItems) {
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                const questionId = utils.getQuestionId(item);
                if (!questionId) continue;
                
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log('题目已答，跳过:', questionId);
                    continue;
                }
                
                const result = await queryAnswer.query(item);
                if (result.found) {
                    const success = await answerFiller.fillPanduan(item, result.answer);
                    if (success) {
                        answeredCount++;
                        this.correctNum++;
                        utils.log(`判断题已选择: ${result.answer}`);
                    }
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }

            // 处理填空题
            const tiankongSelectors = [
                '#tiankongQuestionBox .questionItem',
                '.question-item[data-type="3"]',
                '.question-item:has(input.tk_input)'
            ];
            let tiankongItems = [];
            for (const selector of tiankongSelectors) {
                tiankongItems = document.querySelectorAll(selector);
                if (tiankongItems.length > 0) break;
            }
            
            for (const item of tiankongItems) {
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                const questionId = utils.getQuestionId(item);
                if (!questionId) continue;
                
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log('题目已答，跳过:', questionId);
                    continue;
                }
                
                const result = await queryAnswer.query(item);
                if (result.found) {
                    const answers = Array.isArray(result.answer) ? result.answer : [result.answer];
                    const success = await answerFiller.fillTiankong(item, answers);
                    if (success) {
                        answeredCount++;
                        this.correctNum++;
                        utils.log(`填空题已填写`);
                    }
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }

            // 处理简答题
            const jiandaSelectors = [
                '#jiandaQuestionBox .questionItem',
                '.question-item[data-type="4"]',
                '.question-item:has(.editor-box)'
            ];
            let jiandaItems = [];
            for (const selector of jiandaSelectors) {
                jiandaItems = document.querySelectorAll(selector);
                if (jiandaItems.length > 0) break;
            }
            
            for (const item of jiandaItems) {
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                const questionId = utils.getQuestionId(item);
                if (!questionId) continue;
                
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log('题目已答，跳过:', questionId);
                    continue;
                }
                
                const result = await queryAnswer.query(item);
                if (result.found) {
                    const answer = Array.isArray(result.answer) ? result.answer.join('\n') : result.answer;
                    const success = await answerFiller.fillJianda(item, answer);
                    if (success) {
                        answeredCount++;
                        this.correctNum++;
                        utils.log(`简答题已填写`);
                    }
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }

            this.totalNum = danxuanItems.length + duoxuanItems.length + panduanItems.length + 
                           tiankongItems.length + jiandaItems.length;

            const correctRate = this.totalNum > 0 
                ? Math.round((this.correctNum / this.totalNum) * 100) 
                : 0;
            
            utils.log(`自动答题完成: 共回答 ${answeredCount} 道题目，正确率: ${correctRate}%`);

            // 如果达到阈值且启用自动提交
            if (config.correctRate.autoSubmit && 
                correctRate >= config.correctRate.threshold) {
                utils.log(`正确率 ${correctRate}% 达到阈值 ${config.correctRate.threshold}%，准备自动提交...`);
                await this.submit();
            }

            this.isRunning = false;
            if (controlPanel) {
                controlPanel.updateStatus('答题完成');
            }
        },

        stop: function() {
            this.isRunning = false;
            if (controlPanel) {
                controlPanel.updateStatus('已停止');
            }
            utils.log('自动答题已停止');
        },

        submit: async function() {
            if (!config.features.autoSubmit) {
                utils.log('自动提交未启用');
                return;
            }

            utils.log('开始自动提交...');
            
            // 查找提交按钮
            const submitSelectors = [
                '.submit-btn',
                '.el-button--primary:contains("提交")',
                'button:contains("提交")',
                '[data-action="submit"]'
            ];

            for (const selector of submitSelectors) {
                try {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) {
                        btn.click();
                        utils.log('已点击提交按钮');
                        await utils.sleep(1000);
                        return true;
                    }
                } catch (e) {
                    // 忽略
                }
            }

            utils.log('未找到提交按钮');
            return false;
        }
    };

    // ==================== UI界面模块 ====================
    const ui = {
        // 创建轻量级查询按钮
        createQueryButton: function() {
            const btn = document.createElement('button');
            btn.id = 'czbk-query-btn';
            btn.innerHTML = '🔍 查询答案';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99999;
                width: auto;
                height: 36px;
                background-color: #4285F4;
                color: white;
                border: none;
                border-radius: 18px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                outline: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            btn.addEventListener('mouseover', function() {
                this.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)';
                this.style.transform = 'translateY(-1px)';
            });

            btn.addEventListener('mouseout', function() {
                this.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
                this.style.transform = 'none';
            });

            btn.addEventListener('click', async () => {
                await this.handleQueryClick();
            });

            document.body.appendChild(btn);
            return btn;
        },

        // 创建结果弹窗
        createResultPanel: function() {
            const panel = document.createElement('div');
            panel.id = 'czbk-result-panel';
            panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99998;
                background-color: #fff;
                border: none;
                padding: 0;
                max-width: 400px;
                max-height: 600px;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                display: none;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.5;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                background-color: #4285F4;
                color: white;
                padding: 12px 16px;
                font-weight: 500;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-radius: 12px 12px 0 0;
            `;
            header.innerHTML = '<span>查询结果</span>';

            const closeBtn = document.createElement('span');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = `
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
                padding: 0 0 2px 10px;
            `;
            closeBtn.onclick = () => {
                panel.style.display = 'none';
            };
            header.appendChild(closeBtn);

            const content = document.createElement('div');
            content.id = 'czbk-result-content';
            content.style.cssText = `
                padding: 16px;
                background-color: #fff;
            `;

            panel.appendChild(header);
            panel.appendChild(content);
            document.body.appendChild(panel);

            return panel;
        },

        // 显示查询结果
        showResult: function(result) {
            const panel = document.getElementById('czbk-result-panel');
            const content = document.getElementById('czbk-result-content');
            if (!panel || !content) return;

            let html = '';
            if (result.found) {
                const answer = Array.isArray(result.answer) ? result.answer.join('、') : result.answer;
                const sourceText = {
                    'local': '本地库',
                    'local-text': '本地库(文本匹配)',
                    'api': '云端API',
                    'ai': 'AI答题'
                }[result.source] || '未知';
                
                html = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0; width: 80px;">题目</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word; border-bottom: 1px solid #e0e0e0;">${this.escapeHtml(result.questionData.questionText.substring(0, 100))}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0;">答案</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word; border-bottom: 1px solid #e0e0e0;">${this.escapeHtml(answer)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0;">来源</td>
                            <td style="padding: 8px 12px; color: #202124; border-bottom: 1px solid #e0e0e0;">${sourceText}</td>
                        </tr>
                        ${result.solution ? `
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368;">解析</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word;">${this.escapeHtml(result.solution)}</td>
                        </tr>
                        ` : ''}
                    </table>
                `;
            } else {
                html = `
                    <div style="padding: 12px; color: #5F6368; text-align: center;">
                        ${this.escapeHtml(result.message || '未找到答案')}
                    </div>
                `;
            }

            content.innerHTML = html;
            panel.style.display = 'block';
        },

        escapeHtml: function(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // 处理查询按钮点击
        handleQueryClick: async function() {
            const questionItems = document.querySelectorAll('.question-item, [data-id]');
            if (questionItems.length === 0) {
                alert('未找到题目，请在答题页面使用此功能');
                return;
            }

            const btn = document.getElementById('czbk-query-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '查询中...';
            }

            try {
                // 查询第一个题目
                const result = await queryAnswer.query(questionItems[0]);
                this.showResult(result);

                // 如果找到答案且启用自动填充
                if (result.found && config.features.autoAnswer) {
                    await answerFiller.fill(questionItems[0], result.answer, result.questionData.questionType);
                    utils.log('已自动填充答案');
                }
            } catch (e) {
                utils.log('查询失败:', e);
                this.showResult({
                    found: false,
                    questionData: { questionText: '' },
                    message: '查询失败: ' + e.message
                });
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '🔍 查询答案';
                }
            }
        },

        // 创建刷课按钮
        createCourseButton: function() {
            if (!courseAuto.isVideoPage()) return null;

            const btn = document.createElement('button');
            btn.id = 'czbk-course-btn';
            btn.innerHTML = '🚀 一键完成';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                z-index: 99999;
                width: auto;
                height: 36px;
                background-color: #4285F4;
                color: white;
                border: none;
                border-radius: 18px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                outline: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                padding: 0 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.innerHTML = '处理中...';
                const success = await courseAuto.finishCourse();
                if (success) {
                    btn.innerHTML = '✅ 已完成';
                } else {
                    btn.innerHTML = '❌ 失败';
                }
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '🚀 一键完成';
                }, 2000);
            });

            document.body.appendChild(btn);
            return btn;
        },

        // 创建Vue3+ElementPlus控制面板
        createVuePanel: async function() {
            try {
                // 检查Vue和ElementPlus是否已通过@require加载
                if (!window.Vue || typeof window.Vue.createApp !== 'function') {
                    throw new Error('Vue未通过@require加载，请检查脚本头部配置');
                }
                
                // 加载Element Plus CSS
                try {
                    const cssText = GM_getResourceText('ElementPlusCSS');
                    if (cssText) {
                        const style = document.createElement('style');
                        style.textContent = cssText;
                        document.head.appendChild(style);
                        utils.log('Element Plus CSS已加载');
                    }
                } catch (e) {
                    // 如果GM_getResourceText失败，使用CDN链接
                    if (!document.getElementById('element-plus-css')) {
                        const cssLink = document.createElement('link');
                        cssLink.id = 'element-plus-css';
                        cssLink.rel = 'stylesheet';
                        cssLink.href = 'https://lib.baomitu.com/element-plus/2.7.2/index.css';
                        document.head.appendChild(cssLink);
                        utils.log('Element Plus CSS通过CDN加载');
                    }
                }

                // 创建容器（不使用Shadow DOM，方便样式和交互）
                const host = document.createElement('div');
                host.id = 'czbk-vue-panel-host';
                host.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 99999;';
                document.body.appendChild(host);

                // 加载Element Plus CSS
                try {
                    const cssText = GM_getResourceText('ElementPlusCSS');
                    if (cssText) {
                        const style = document.createElement('style');
                        style.textContent = cssText;
                        document.head.appendChild(style);
                        utils.log('Element Plus CSS已通过@resource加载');
                    }
                } catch (e) {
                    // 如果GM_getResourceText失败，使用CDN链接
                    if (!document.getElementById('element-plus-css')) {
                        const cssLink = document.createElement('link');
                        cssLink.id = 'element-plus-css';
                        cssLink.rel = 'stylesheet';
                        cssLink.href = 'https://lib.baomitu.com/element-plus/2.7.2/index.css';
                        document.head.appendChild(cssLink);
                        utils.log('Element Plus CSS通过CDN加载');
                    }
                }

                // 检查Vue和ElementPlus是否已通过@require加载
                // 首先检查window.Vue
                let VueObj = window.Vue;
                
                // 如果window.Vue不存在，尝试从全局作用域获取
                if (!VueObj || typeof VueObj.createApp !== 'function') {
                    if (typeof Vue !== 'undefined' && typeof Vue.createApp === 'function') {
                        VueObj = Vue;
                        window.Vue = Vue; // 确保设置window.Vue
                        utils.log('从全局作用域获取Vue并设置为window.Vue');
                    } else {
                        // 尝试通过内联脚本获取（因为@require可能在IIFE中执行）
                        try {
                            const checkScript = document.createElement('script');
                            checkScript.textContent = `
                                if (typeof Vue !== 'undefined' && typeof Vue.createApp === 'function') {
                                    window.Vue = Vue;
                                }
                            `;
                            document.head.appendChild(checkScript);
                            document.head.removeChild(checkScript);
                            
                            if (window.Vue && typeof window.Vue.createApp === 'function') {
                                VueObj = window.Vue;
                                utils.log('通过内联脚本获取Vue');
                            }
                        } catch (e) {
                            utils.log('尝试获取Vue时出错:', e);
                        }
                    }
                }
                
                if (!VueObj || typeof VueObj.createApp !== 'function') {
                    utils.log('Vue检查失败，window.Vue:', window.Vue);
                    utils.log('typeof Vue:', typeof Vue);
                    utils.log('window对象中的Vue相关变量:', Object.keys(window).filter(k => k.toLowerCase().includes('vue')));
                    throw new Error('Vue未通过@require正确加载，请检查脚本头部的@require配置');
                }
                
                // Element Plus通过@require加载后，需要检查是否可用
                // 由于@require的脚本在IIFE中执行，ElementPlus可能不会自动暴露为全局变量
                // 我们需要通过其他方式获取
                let elementPlusLib = null;
                
                // 方法1: 检查常见的全局变量名
                const checkNames = ['ElementPlus', 'elementPlus', 'El', 'el'];
                for (const name of checkNames) {
                    if (window[name] && (window[name].install || window[name].Button || window[name].ElButton)) {
                        elementPlusLib = window[name];
                        utils.log(`找到Element Plus通过变量名: ${name}`);
                        break;
                    }
                }
                
                // 方法2: 如果没找到，尝试通过特征检测所有window属性
                if (!elementPlusLib) {
                    for (const key in window) {
                        const obj = window[key];
                        if (obj && typeof obj === 'object' && typeof obj.install === 'function') {
                            // 检查是否是Element Plus（有Button、Card等组件）
                            if (obj.Button || obj.ElButton || obj.Card || obj.ElCard || 
                                obj.Tabs || obj.ElTabs || obj.Input || obj.ElInput) {
                                elementPlusLib = obj;
                                window.ElementPlus = obj; // 设置为全局变量
                                utils.log(`找到Element Plus通过特征检测: ${key}`);
                                break;
                            }
                        }
                    }
                }
                
                if (!elementPlusLib) {
                    utils.log('警告：Element Plus未找到，但继续尝试创建应用');
                    utils.log('window对象中可能的Vue插件:', Object.keys(window).filter(k => {
                        const obj = window[k];
                        return obj && typeof obj === 'object' && typeof obj.install === 'function';
                    }));
                }
                
                // 统一使用window.Vue和window.ElementPlus
                // 确保Vue被正确设置（VueObj已经在前面检查过了）
                window.Vue = VueObj;
                
                // 确保全局作用域中也有Vue变量（Vue模板编译器可能需要）
                // 使用Object.defineProperty确保可以在严格模式下设置
                try {
                    if (typeof Vue === 'undefined') {
                        // 在全局作用域中设置Vue（如果不存在）
                        (function() {
                            // 在非严格模式下，可以直接赋值给全局对象
                            if (typeof globalThis !== 'undefined') {
                                globalThis.Vue = VueObj;
                            }
                            // 尝试在window上设置
                            window.Vue = VueObj;
                        })();
                    }
                } catch (e) {
                    utils.log('设置全局Vue变量时出错（可能不影响使用）:', e);
                }
                
                if (elementPlusLib) {
                    window.ElementPlus = elementPlusLib;
                    window.antd = elementPlusLib; // 兼容性
                    window.antDesignVue = elementPlusLib; // 兼容性
                }
                
                // 再次确认Vue可用
                if (!window.Vue || typeof window.Vue.createApp !== 'function') {
                    throw new Error('Vue未正确初始化，无法创建应用');
                }
                
                // 创建Vue应用（使用VueObj而不是window.Vue，确保引用正确）
                // 但确保在创建应用时，Vue在全局作用域中可用
                const { createApp, ref, onMounted } = VueObj;
                const antdLib = elementPlusLib;
                
                // 在创建应用之前，确保Vue在全局作用域中可用（用于模板编译）
                // Vue 3 的模板编译器在运行时编译模板时可能需要访问全局的 Vue
                // 使用 eval 来在全局作用域中设置 Vue（避免严格模式限制）
                try {
                    // 方法1: 直接设置 window.Vue（应该已经设置了）
                    window.Vue = VueObj;
                    
                    // 方法2: 使用 eval 在全局作用域设置 Vue（用于模板编译）
                    // 注意：这需要在非严格模式下，或者使用间接 eval
                    const setGlobalVue = new Function('Vue', 'this.Vue = Vue;');
                    setGlobalVue(VueObj);
                    
                    // 方法3: 确保在全局作用域中也有 Vue（如果可能）
                    if (typeof globalThis !== 'undefined') {
                        globalThis.Vue = VueObj;
                    }
                } catch (e) {
                    utils.log('设置全局Vue时出错（可能不影响使用）:', e);
                }
                
                const app = createApp({
                    setup() {
                        const activeKey = ref('control');
                        const apiKey = ref(GM_getValue('czbk_api_key', ''));
                        const apiUrl = ref(GM_getValue('czbk_api_url', config.api.baseUrl) || config.api.baseUrl);
                        const apiStatus = ref(apiKey.value ? '已配置' : '未配置');
                        const autoAnswer = ref(config.features.autoAnswer);
                        const autoSubmit = ref(config.features.autoSubmit);
                        const skipAnswered = ref(config.features.skipAnswered);
                        const useAI = ref(config.features.useAI);
                        const statusText = ref('等待开始');
                        const answerCount = ref(0);
                        const queryResult = ref(null);
                        const queryLoading = ref(false);
                        const logs = ref([]);
                        
                        // 获取message API
                        let messageApi;
                        try {
                            messageApi = antdLib.message || antdLib.Message || (() => {
                                return {
                                    success: (msg) => console.log('Success:', msg),
                                    error: (msg) => console.error('Error:', msg),
                                    warning: (msg) => console.warn('Warning:', msg),
                                    info: (msg) => console.info('Info:', msg)
                                };
                            })();
                        } catch (e) {
                            messageApi = {
                                success: (msg) => console.log('Success:', msg),
                                error: (msg) => console.error('Error:', msg),
                                warning: (msg) => console.warn('Warning:', msg),
                                info: (msg) => console.info('Info:', msg)
                            };
                        }

                        // 初始化
                        onMounted(() => {
                            updateStats();
                            updateLogs();
                            setInterval(() => updateLogs(), 1000);
                        });

                        // 更新统计
                        const updateStats = () => {
                            const stats = answerDBManager.getStats();
                            answerCount.value = stats.total;
                        };

                        // 更新日志
                        const updateLogs = () => {
                            logs.value = answerLogs.slice(0, 50);
                        };

                        // 保存API配置
                        const saveApiConfig = () => {
                            if (!apiKey.value.trim()) {
                                messageApi.warning('请输入API Key');
                                return;
                            }
                            window.apiKey = apiKey.value.trim();
                            config.api.baseUrl = apiUrl.value.trim() || config.api.baseUrl;
                            GM_setValue('czbk_api_key', apiKey.value);
                            GM_setValue('czbk_api_url', config.api.baseUrl);
                            apiStatus.value = '已配置';
                            messageApi.success('API配置已保存');
                            utils.log('API配置已保存');
                        };

                        // 测试API连接
                        const testApiConnection = async () => {
                            if (!apiKey.value.trim() || !apiUrl.value.trim()) {
                                messageApi.warning('请先填写API Key和API地址');
                                return;
                            }
                            apiStatus.value = '测试中...';
                            try {
                                const originalApiKey = window.apiKey;
                                const originalBaseUrl = config.api.baseUrl;
                                window.apiKey = apiKey.value.trim();
                                config.api.baseUrl = apiUrl.value.trim();
                                
                                const response = await apiQuery.getKeyInfo();
                                if (response && response.code === 1 && response.data) {
                                    apiStatus.value = '连接成功';
                                    const dailyRemaining = response.data.daily_limit - response.data.daily_queries;
                                    messageApi.success(`API连接成功！剩余次数: ${dailyRemaining}/${response.data.daily_limit}`);
                                } else {
                                    throw new Error(response?.message || 'API返回错误');
                                }
                                
                                window.apiKey = originalApiKey;
                                config.api.baseUrl = originalBaseUrl;
                            } catch (error) {
                                apiStatus.value = '连接失败';
                                messageApi.error('API连接测试失败：' + (error.message || error));
                            }
                        };

                        // 查询答案
                        const handleQueryAnswer = async () => {
                            const questionItems = document.querySelectorAll('.question-item, [data-id]');
                            if (questionItems.length === 0) {
                                messageApi.warning('未找到题目，请在答题页面使用此功能');
                                return;
                            }
                            
                            queryLoading.value = true;
                            queryResult.value = null;
                            
                            try {
                                const result = await queryAnswer.query(questionItems[0]);
                                queryResult.value = result;
                                
                                if (result.found) {
                                    messageApi.success('找到答案！');
                                    // 自动填充
                                    if (autoAnswer.value) {
                                        await answerFiller.fill(questionItems[0], result.answer, result.questionData.questionType);
                                        messageApi.success('已自动填充答案');
                                    }
                                } else {
                                    messageApi.info('未找到答案');
                                }
                            } catch (e) {
                                messageApi.error('查询失败：' + e.message);
                                queryResult.value = { found: false, message: e.message };
                            } finally {
                                queryLoading.value = false;
                            }
                        };

                        // 完成课程
                        const handleFinishCourse = async () => {
                            if (!courseAuto.isVideoPage()) {
                                messageApi.warning('当前不是视频页面');
                                return;
                            }
                            queryLoading.value = true;
                            try {
                                const success = await courseAuto.finishCourse();
                                if (success) {
                                    messageApi.success('课程已完成');
                                } else {
                                    messageApi.error('完成课程失败');
                                }
                            } catch (e) {
                                messageApi.error('完成课程失败：' + e.message);
                            } finally {
                                queryLoading.value = false;
                            }
                        };

                        // 导入答案
                        const handleImportAnswer = () => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json';
                            input.onchange = async (e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                    try {
                                        const jsonData = JSON.parse(event.target.result);
                                        const result = answerDBManager.importJSON(jsonData);
                                        if (result.success) {
                                            messageApi.success(`导入成功！共导入 ${result.count} 条答案`);
                                            updateStats();
                                        } else {
                                            messageApi.error('导入失败：' + result.error);
                                        }
                                    } catch (error) {
                                        messageApi.error('导入失败：JSON格式错误');
                                    }
                                };
                                reader.readAsText(file);
                            };
                            input.click();
                        };

                        // 导出答案
                        const handleExportAnswer = () => {
                            const json = answerDBManager.exportJSON();
                            if (json) {
                                const blob = new Blob([json], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `czbk_answers_${new Date().toISOString().slice(0, 10)}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                                messageApi.success('答案库已导出');
                            }
                        };

                        // 清空答案
                        const handleClearAnswer = () => {
                            const Modal = antdLib.Modal || antdLib.modal;
                            if (Modal && Modal.confirm) {
                                Modal.confirm({
                                    title: '确认清空',
                                    content: '确定要清空所有答案吗？',
                                    onOk: () => {
                                        answerDBManager.clear();
                                        updateStats();
                                        messageApi.success('答案库已清空');
                                    }
                                });
                            } else {
                                if (confirm('确定要清空所有答案吗？')) {
                                    answerDBManager.clear();
                                    updateStats();
                                    messageApi.success('答案库已清空');
                                }
                            }
                        };

                        // 开始答题
                        const handleStartAnswer = () => {
                            // 使用全局的 autoAnswer 对象，不是 ref
                            if (window.autoAnswer && window.autoAnswer.isRunning) {
                                messageApi.warning('答题已在进行中');
                                return;
                            }
                            statusText.value = '正在答题...';
                            if (window.autoAnswer) {
                                window.autoAnswer.start();
                            } else {
                                // 如果全局对象不存在，尝试直接调用
                                try {
                                    autoAnswer.start();
                                } catch (e) {
                                    utils.log('启动答题失败:', e);
                                    messageApi.error('启动答题失败');
                                    return;
                                }
                            }
                            messageApi.success('已开始自动答题');
                        };

                        // 停止答题
                        const handleStopAnswer = () => {
                            // 使用全局的 autoAnswer 对象，不是 ref
                            if (window.autoAnswer && !window.autoAnswer.isRunning) {
                                messageApi.warning('答题未在进行中');
                                return;
                            }
                            if (window.autoAnswer) {
                                window.autoAnswer.stop();
                            } else {
                                // 如果全局对象不存在，尝试直接调用
                                try {
                                    autoAnswer.stop();
                                } catch (e) {
                                    utils.log('停止答题失败:', e);
                                    messageApi.error('停止答题失败');
                                    return;
                                }
                            }
                            statusText.value = '已停止';
                            messageApi.info('已停止自动答题');
                        };

                        // 复制日志
                        const handleCopyLogs = () => {
                            const logText = logs.value.map(log => `[${log.time}] ${log.message}`).join('\n');
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(logText).then(() => {
                                    messageApi.success('日志已复制到剪贴板');
                                }).catch(() => {
                                    messageApi.error('复制失败');
                                });
                            } else {
                                messageApi.warning('浏览器不支持剪贴板操作');
                            }
                        };

                        // 清空日志
                        const handleClearLogs = () => {
                            answerLogs.length = 0;
                            updateLogs();
                            messageApi.success('日志已清空');
                        };

                        // 关闭面板
                        const handleClosePanel = () => {
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host) {
                                host.style.display = 'none';
                            }
                        };

                        return {
                            activeKey,
                            apiKeyValue: apiKey,
                            apiUrlValue: apiUrl,
                            apiStatus,
                            autoAnswerValue: autoAnswer,
                            autoSubmitValue: autoSubmit,
                            skipAnsweredValue: skipAnswered,
                            useAIValue: useAI,
                            statusText,
                            answerCount,
                            recordCount: answerCount,
                            queryResult,
                            queryLoading,
                            logs,
                            saveApiConfig,
                            testApiConnection,
                            handleQueryAnswer,
                            handleFinishCourse,
                            handleImportAnswer,
                            handleExportAnswer,
                            handleClearAnswer,
                            handleStartAnswer,
                            handleStopAnswer,
                            handleCopyLogs,
                            handleClearLogs,
                            handleClosePanel,
                            handleAutoAnswerChange,
                            handleAutoSubmitChange,
                            handleSkipAnsweredChange,
                            handleUseAIChange,
                            updateStats,
                            updateLogs,
                            isVideoPage: () => courseAuto.isVideoPage()
                        };
                    },
                    template: `
                        <el-card 
                            :bordered="false" 
                            style="width: 500px; max-height: 700px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);"
                            :head-style="{ background: '#4285F4', color: '#fff', border: 'none' }"
                        >
                            <template #title>
                                <span style="color: #fff; font-weight: bold;">传智播客答题控制面板</span>
                            </template>
                            <template #header>
                                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                    <span style="color: #fff; font-weight: bold;">传智播客答题控制面板</span>
                                    <el-button type="text" @click="handleClosePanel" style="color: #fff;">×</el-button>
                                </div>
                            </template>
                            
                            <el-tabs v-model="activeKey" size="small">
                                <!-- 控制 Tab -->
                                <el-tab-pane label="控制" name="control">
                                    <el-space direction="vertical" style="width: 100%;" :size="12">
                                        <el-checkbox v-model="autoAnswerValue" @change="handleAutoAnswerChange">自动答题</el-checkbox>
                                        <el-checkbox v-model="autoSubmitValue" @change="handleAutoSubmitChange">自动提交</el-checkbox>
                                        <el-checkbox v-model="skipAnsweredValue" @change="handleSkipAnsweredChange">跳过已答题</el-checkbox>
                                        <el-checkbox v-model="useAIValue" @change="handleUseAIChange">启用AI答题</el-checkbox>
                                        
                                        <el-divider style="margin: 12px 0;" />
                                        
                                        <el-space>
                                            <el-button type="primary" @click="handleStartAnswer">开始答题</el-button>
                                            <el-button type="danger" @click="handleStopAnswer">停止答题</el-button>
                                        </el-space>
                                        
                                        <el-divider style="margin: 12px 0;" />
                                        
                                        <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">答题日志</div>
                                        <div style="max-height: 200px; overflow-y: auto; background: #f5f7fa; padding: 8px; border-radius: 4px; font-size: 11px;">
                                            <div v-if="logs.length === 0" style="color: #909399; text-align: center; padding: 10px;">暂无日志</div>
                                            <div v-for="(log, index) in logs" :key="index" style="margin-bottom: 4px; line-height: 1.4;">
                                                <span style="color: #909399;">[{{ log.time }}]</span>
                                                <span>{{ log.message }}</span>
                                            </div>
                                        </div>
                                        <el-space>
                                            <el-button size="small" @click="handleCopyLogs">复制</el-button>
                                            <el-button size="small" @click="handleClearLogs">清空</el-button>
                                        </el-space>
                                        
                                        <el-divider style="margin: 12px 0;" />
                                        
                                        <div style="font-size: 12px; color: #909399;">
                                            <div>状态: {{ statusText }}</div>
                                            <div>答案库: {{ answerCount }} 道题目</div>
                                            <div>API Key: {{ apiStatus }}</div>
                                        </div>
                                    </el-space>
                                </el-tab-pane>
                                
                                <!-- 查询 Tab -->
                                <el-tab-pane label="查询" name="query">
                                    <el-space direction="vertical" style="width: 100%;" :size="12">
                                        <el-button type="primary" :loading="queryLoading" @click="handleQueryAnswer" style="width: 100%;">
                                            🔍 查询当前题目
                                        </el-button>
                                        <el-button v-if="isVideoPage()" type="success" :loading="queryLoading" @click="handleFinishCourse" style="width: 100%;">
                                            🚀 一键完成课程
                                        </el-button>
                                        
                                        <div v-if="queryResult" style="padding: 12px; background: #f5f7fa; border-radius: 4px; margin-top: 10px;">
                                            <div v-if="queryResult.found">
                                                <div><strong>答案：</strong>{{ Array.isArray(queryResult.answer) ? queryResult.answer.join('、') : queryResult.answer }}</div>
                                                <div v-if="queryResult.solution" style="margin-top: 8px;"><strong>解析：</strong>{{ queryResult.solution }}</div>
                                                <div style="margin-top: 8px; color: #909399; font-size: 11px;">来源：{{ queryResult.source }}</div>
                                            </div>
                                            <div v-else style="color: #909399;">{{ queryResult.message || '未找到答案' }}</div>
                                        </div>
                                    </el-space>
                                </el-tab-pane>
                                
                                <!-- 配置 Tab -->
                                <el-tab-pane label="配置" name="config">
                                    <el-space direction="vertical" style="width: 100%;" :size="12">
                                        <div>
                                            <label style="display: block; margin-bottom: 4px; font-size: 12px;">API Key：</label>
                                            <el-input v-model="apiKeyValue" type="password" placeholder="请输入API Key" show-password />
                                        </div>
                                        <div>
                                            <label style="display: block; margin-bottom: 4px; font-size: 12px;">API地址：</label>
                                            <el-input v-model="apiUrlValue" placeholder="http://localhost:8000" />
                                        </div>
                                        <el-space>
                                            <el-button type="primary" @click="saveApiConfig" style="width: 100%;">保存配置</el-button>
                                            <el-button type="default" @click="testApiConnection" style="width: 100%;">测试连接</el-button>
                                        </el-space>
                                        <div style="font-size: 12px; color: #909399;">
                                            API状态: <span :style="{ color: apiStatus === '已配置' || apiStatus === '连接成功' ? '#67C23A' : '#E6A23C' }">{{ apiStatus }}</span>
                                        </div>
                                    </el-space>
                                </el-tab-pane>
                                
                                <!-- 记录 Tab -->
                                <el-tab-pane label="记录" name="record">
                                    <el-space direction="vertical" style="width: 100%;" :size="12">
                                        <el-space>
                                            <el-button @click="handleImportAnswer">导入</el-button>
                                            <el-button type="primary" @click="handleExportAnswer">导出</el-button>
                                            <el-button type="danger" @click="handleClearAnswer">清空</el-button>
                                        </el-space>
                                        <div style="font-size: 12px; color: #909399;">
                                            共 {{ recordCount }} 道题目
                                        </div>
                                        <div style="max-height: 300px; overflow-y: auto; background: #f5f7fa; padding: 10px; border-radius: 4px;">
                                            <div style="color: #909399; text-align: center; padding: 20px;">答案记录将在后续版本中显示</div>
                                        </div>
                                    </el-space>
                                </el-tab-pane>
                            </el-tabs>
                        </el-card>
                    `
                });

                // 使用UI库（Element Plus或Antdv）
                if (antdLib) {
                    try {
                        // Element Plus使用app.use()注册
                        if (antdLib.install) {
                            app.use(antdLib);
                            utils.log('UI库（Element Plus）已注册到Vue应用');
                        } else {
                            // 如果没有install方法，尝试按需注册组件
                            utils.log('UI库没有install方法，尝试按需注册组件');
                            // Element Plus的组件通常已经全局可用，不需要手动注册
                        }
                    } catch (e) {
                        utils.log('UI库注册失败:', e.message);
                        utils.log('错误详情:', e);
                    }
                } else {
                    utils.log('警告：UI库未找到，尝试继续创建应用');
                    // 即使没有UI库，也尝试创建应用，可能组件会通过其他方式加载
                }
                
                app.mount(host);
                
                utils.log('Vue3 + Element Plus控制面板已创建');
                return { host, app };
            } catch (e) {
                const errorMsg = e?.message || e?.toString() || JSON.stringify(e) || '未知错误';
                utils.log('创建Vue控制面板失败:', errorMsg);
                console.error('Vue面板创建错误详情:', e);
                // 降级到HTML面板
                controlPanel.create();
            }
        },

        // 检查Vue和ElementPlus是否已通过@require加载（不再需要动态加载）
        loadVueLibraries: function() {
            return new Promise((resolve, reject) => {
                // 由于使用@require，Vue和ElementPlus应该已经加载完成
                // 直接检查并resolve
                if (window.Vue && typeof window.Vue.createApp === 'function') {
                    utils.log('Vue已通过@require加载');
                    resolve();
                } else {
                    reject(new Error('Vue未通过@require正确加载，请检查脚本头部的@require配置'));
                }
            });
        },

        // 初始化UI
        init: async function() {
            if (config.features.showControlPanel) {
                if (config.features.useVueUI) {
                    // 使用Vue3 + ElementPlus面板
                    await this.createVuePanel();
                } else {
                    // 使用HTML面板
                    controlPanel.create();
                }
            }
        }
        };
    
        // ==================== 控制面板模块 ====================
        const controlPanel = {
            currentTab: 'control',
            isRunning: false,
    
            create: function() {
                // 检查是否已存在
                if (document.getElementById('czbkControlPanel')) {
                    return;
                }
    
                const panel = document.createElement('div');
                panel.id = 'czbkControlPanel';
                panel.innerHTML = `
                    <div style="position: fixed; top: 10px; right: 10px; z-index: 99999; background: #fff; border: 2px solid #4285F4; border-radius: 8px; padding: 0; box-shadow: 0 2px 12px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; width: 450px; height: 600px; overflow: hidden; display: flex; flex-direction: column;">
                        <div style="font-weight: bold; padding: 12px 15px; color: #4285F4; font-size: 16px; cursor: move; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                            <span>传智播客答题控制面板</span>
                            <span id="czbkPanelClose" style="cursor: pointer; font-size: 20px; color: #909399; padding: 0 5px;">×</span>
                        </div>
                        
                        <!-- Tab 导航 -->
                        <div style="display: flex; border-bottom: 1px solid #eee;">
                            <div id="czbkTabControl" class="czbk-tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; border-bottom: 2px solid #4285F4; color: #4285F4; font-weight: bold;">控制</div>
                            <div id="czbkTabQuery" class="czbk-tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #909399;">查询</div>
                            <div id="czbkTabAnswer" class="czbk-tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #909399;">配置</div>
                            <div id="czbkTabRecord" class="czbk-tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #909399;">记录</div>
                        </div>
                        
                        <!-- Tab 内容区域 -->
                        <div style="padding: 15px; flex: 1; overflow-y: auto;">
                            <!-- 控制 Tab -->
                            <div id="czbkTabContentControl" class="czbk-tab-content">
                                <div style="margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" id="czbkAutoAnswerCheck" ${config.features.autoAnswer ? 'checked' : ''} style="margin-right: 8px;">
                                        <span>自动答题</span>
                                    </label>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" id="czbkAutoSubmitCheck" ${config.features.autoSubmit ? 'checked' : ''} style="margin-right: 8px;">
                                        <span>自动提交</span>
                                    </label>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" id="czbkSkipAnsweredCheck" ${config.features.skipAnswered ? 'checked' : ''} style="margin-right: 8px;">
                                        <span>跳过已答题</span>
                                    </label>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" id="czbkUseAICheck" ${config.features.useAI ? 'checked' : ''} style="margin-right: 8px;">
                                        <span>启用AI答题</span>
                                    </label>
                                </div>
                                <div style="margin-bottom: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                    <button id="czbkStartAnswerBtn" style="width: 100%; padding: 8px; background: #4285F4; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-bottom: 8px;">开始自动答题</button>
                                    <button id="czbkStopAnswerBtn" style="width: 100%; padding: 8px; background: #f56c6c; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">停止答题</button>
                                </div>
                                <div style="margin-top: 10px; font-size: 12px; color: #909399;">
                                    <div>状态: <span id="czbkStatusText">等待开始</span></div>
                                    <div style="margin-top: 5px;">答案库: <span id="czbkAnswerCount">0</span> 道题目</div>
                                    <div style="margin-top: 5px;">API Key: <span id="czbkApiKeyStatus">${apiKey ? '已配置' : '未配置'}</span></div>
                                </div>
                                
                                <!-- 答题日志区域 -->
                                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <div style="font-size: 13px; font-weight: bold; color: #303133;">答题日志</div>
                                        <div style="display: flex; gap: 5px;">
                                            <button id="czbkCopyLogBtn" style="padding: 2px 8px; background: #4285F4; color: #fff; border: 1px solid #4285F4; border-radius: 3px; cursor: pointer; font-size: 11px;">复制</button>
                                            <button id="czbkClearLogBtn" style="padding: 2px 8px; background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6; border-radius: 3px; cursor: pointer; font-size: 11px;">清空</button>
                                        </div>
                                    </div>
                                    <div id="czbkLogContainer" style="background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; max-height: 200px; overflow-y: auto; font-size: 11px; font-family: 'Courier New', monospace;">
                                        <div style="color: #909399; text-align: center; padding: 10px;">暂无日志</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 答题 Tab -->
                            <div id="czbkTabContentAnswer" class="czbk-tab-content" style="display: none;">
                                <div style="margin-bottom: 15px;">
                                    <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #303133;">API配置：</h4>
                                    
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">API Key：</label>
                                        <input type="password" id="czbkApiKeyInput" placeholder="请输入API Key" value="${apiKey || ''}"
                                            style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box;">
                                        <div style="margin-top: 4px; font-size: 11px; color: #909399;">
                                            <label style="display: flex; align-items: center; cursor: pointer;">
                                                <input type="checkbox" id="czbkShowApiKey" style="margin-right: 4px;">
                                                <span>显示密钥</span>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">API地址：</label>
                                        <input type="text" id="czbkApiUrlInput" placeholder="http://localhost:8000" value="${config.api.baseUrl}"
                                            style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box;">
                                    </div>
                                    
                                    <div style="margin-bottom: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                        <button id="czbkSaveApiBtn" style="width: 100%; padding: 10px; background: #4285F4; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; margin-bottom: 8px;">保存配置</button>
                                        <button id="czbkTestApiBtn" style="width: 100%; padding: 8px; background: #67C23A; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">测试连接</button>
                                    </div>
                                    
                                    <div style="font-size: 12px; color: #909399; margin-top: 10px;">
                                        <div>API状态: <span id="czbkApiStatus" style="color: ${apiKey ? '#67C23A' : '#E6A23C'};">${apiKey ? '已配置' : '未配置'}</span></div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 答题记录 Tab -->
                            <div id="czbkTabContentRecord" class="czbk-tab-content" style="display: none;">
                                <div style="margin-bottom: 15px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <h4 style="margin: 0; font-size: 14px; color: #303133;">答案库管理</h4>
                                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                            <button id="czbkImportAnswerBtn" style="padding: 5px 10px; background: #909399; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导入</button>
                                            <button id="czbkExportAnswerBtn" style="padding: 5px 10px; background: #67C23A; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导出</button>
                                            <button id="czbkClearAnswerBtn" style="padding: 5px 10px; background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6; border-radius: 4px; cursor: pointer; font-size: 12px;">清空</button>
                                        </div>
                                    </div>
                                    <input type="file" id="czbkImportAnswerFile" accept=".json" style="display: none;">
                                    <div style="font-size: 12px; color: #909399; margin-bottom: 10px;">
                                        共 <span id="czbkRecordCount">0</span> 道题目
                                    </div>
                                    <div id="czbkAnswerRecordContainer" style="background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 10px; min-height: 200px; max-height: 400px; overflow-y: auto;">
                                        <div style="color: #909399; text-align: center; padding: 20px;">暂无答案记录</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
    
                document.body.appendChild(panel);
    
                // 绑定事件
                this.bindEvents();
                
                // 初始化数据
                this.updateAnswerCount();
                this.updateLogs();
                this.updateRecordCount();
                this.updateAnswerRecordDisplay();
    
                // 拖拽功能
                this.makeDraggable(panel);
            },
    
            bindEvents: function() {
                // Tab切换
                document.getElementById('czbkTabControl').addEventListener('click', () => this.switchTab('control'));
                document.getElementById('czbkTabAnswer').addEventListener('click', () => this.switchTab('answer'));
                document.getElementById('czbkTabRecord').addEventListener('click', () => this.switchTab('record'));
    
                // 关闭按钮
                document.getElementById('czbkPanelClose').addEventListener('click', () => {
                    const panel = document.getElementById('czbkControlPanel');
                    if (panel) {
                        panel.style.display = 'none';
                    }
                });
    
                // 配置开关
                document.getElementById('czbkAutoAnswerCheck').addEventListener('change', (e) => {
                    config.features.autoAnswer = e.target.checked;
                });
                document.getElementById('czbkAutoSubmitCheck').addEventListener('change', (e) => {
                    config.features.autoSubmit = e.target.checked;
                });
                document.getElementById('czbkSkipAnsweredCheck').addEventListener('change', (e) => {
                    config.features.skipAnswered = e.target.checked;
                });
                document.getElementById('czbkUseAICheck').addEventListener('change', (e) => {
                    config.features.useAI = e.target.checked;
                });
    
                // 开始/停止答题
                document.getElementById('czbkStartAnswerBtn').addEventListener('click', () => {
                    autoAnswer.start();
                });
                document.getElementById('czbkStopAnswerBtn').addEventListener('click', () => {
                    autoAnswer.stop();
                });
    
                // 日志操作
                document.getElementById('czbkCopyLogBtn').addEventListener('click', () => this.copyLogs());
                document.getElementById('czbkClearLogBtn').addEventListener('click', () => this.clearLogs());
    
                // API配置
                document.getElementById('czbkShowApiKey').addEventListener('change', (e) => {
                    const input = document.getElementById('czbkApiKeyInput');
                    input.type = e.target.checked ? 'text' : 'password';
                });
                document.getElementById('czbkSaveApiBtn').addEventListener('click', () => this.saveApiConfig());
                document.getElementById('czbkTestApiBtn').addEventListener('click', () => this.testApiConnection());
    
                // 答案库管理
                document.getElementById('czbkImportAnswerBtn').addEventListener('click', () => {
                    document.getElementById('czbkImportAnswerFile').click();
                });
                document.getElementById('czbkImportAnswerFile').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const jsonData = JSON.parse(event.target.result);
                            const result = answerDBManager.importJSON(jsonData);
                            if (result.success) {
                                alert(`导入成功！共导入 ${result.count} 条答案`);
                                this.updateAnswerCount();
                                this.updateRecordCount();
                            } else {
                                alert('导入失败：' + result.error);
                            }
                        } catch (error) {
                            alert('导入失败：JSON格式错误');
                            utils.log('导入答案失败:', error);
                        }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                });
                document.getElementById('czbkExportAnswerBtn').addEventListener('click', () => {
                    const json = answerDBManager.exportJSON();
                    if (json) {
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `czbk_answers_${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        utils.log('答案库已导出');
                    }
                });
                document.getElementById('czbkClearAnswerBtn').addEventListener('click', () => {
                    if (confirm('确定要清空所有答案吗？')) {
                        answerDBManager.clear();
                        this.updateAnswerCount();
                        this.updateRecordCount();
                        utils.log('答案库已清空');
                    }
                });
            },
    
            switchTab: function(tabName) {
                this.currentTab = tabName;
                
                // 更新Tab样式
                ['czbkTabControl', 'czbkTabAnswer', 'czbkTabRecord'].forEach(id => {
                    const tab = document.getElementById(id);
                    if (tab) {
                        tab.style.borderBottom = 'none';
                        tab.style.color = '#909399';
                        tab.style.fontWeight = 'normal';
                    }
                });
                
                ['czbkTabContentControl', 'czbkTabContentAnswer', 'czbkTabContentRecord'].forEach(id => {
                    const content = document.getElementById(id);
                    if (content) {
                        content.style.display = 'none';
                    }
                });
                
                // 设置当前tab
                if (tabName === 'control') {
                    const tab = document.getElementById('czbkTabControl');
                    const content = document.getElementById('czbkTabContentControl');
                    if (tab) {
                        tab.style.borderBottom = '2px solid #4285F4';
                        tab.style.color = '#4285F4';
                        tab.style.fontWeight = 'bold';
                    }
                    if (content) content.style.display = 'block';
                } else if (tabName === 'answer') {
                    const tab = document.getElementById('czbkTabAnswer');
                    const content = document.getElementById('czbkTabContentAnswer');
                    if (tab) {
                        tab.style.borderBottom = '2px solid #4285F4';
                        tab.style.color = '#4285F4';
                        tab.style.fontWeight = 'bold';
                    }
                    if (content) content.style.display = 'block';
                } else if (tabName === 'record') {
                    const tab = document.getElementById('czbkTabRecord');
                    const content = document.getElementById('czbkTabContentRecord');
                    if (tab) {
                        tab.style.borderBottom = '2px solid #4285F4';
                        tab.style.color = '#4285F4';
                        tab.style.fontWeight = 'bold';
                    }
                    if (content) content.style.display = 'block';
                    this.updateRecordCount();
                    this.updateAnswerRecordDisplay();
                }
            },
    
            makeDraggable: function(element) {
                let isDragging = false;
                let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
    
                const header = element.querySelector('div:first-child');
                if (!header) return;
                
                header.style.cursor = 'move';
                header.style.userSelect = 'none';
    
                header.addEventListener('mousedown', (e) => {
                    if (e.target.id === 'czbkPanelClose') return;
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                    
                    isDragging = true;
                    e.preventDefault();
                    
                    const rect = element.getBoundingClientRect();
                    initialX = e.clientX - rect.left;
                    initialY = e.clientY - rect.top;
                    
                    xOffset = rect.left;
                    yOffset = rect.top;
                });
    
                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        e.preventDefault();
                        currentX = e.clientX - initialX;
                        currentY = e.clientY - initialY;
                        
                        const maxX = window.innerWidth - element.offsetWidth;
                        const maxY = window.innerHeight - element.offsetHeight;
                        currentX = Math.max(0, Math.min(currentX, maxX));
                        currentY = Math.max(0, Math.min(currentY, maxY));
                        
                        element.style.left = currentX + 'px';
                        element.style.top = currentY + 'px';
                        element.style.right = 'auto';
                    }
                });
    
                document.addEventListener('mouseup', () => {
                    isDragging = false;
                });
            },
    
            updateAnswerCount: function() {
                const stats = answerDBManager.getStats();
                const countElement = document.getElementById('czbkAnswerCount');
                if (countElement) {
                    countElement.textContent = stats.total;
                }
            },
    
            updateRecordCount: function() {
                const stats = answerDBManager.getStats();
                const countElement = document.getElementById('czbkRecordCount');
                if (countElement) {
                    countElement.textContent = stats.total;
                }
                // 更新答案记录显示
                this.updateAnswerRecordDisplay();
            },
            
            updateAnswerRecordDisplay: function() {
                const container = document.getElementById('czbkAnswerRecordContainer');
                if (!container) return;
                
                const stats = answerDBManager.getStats();
                if (stats.total === 0) {
                    container.innerHTML = '<div style="color: #909399; text-align: center; padding: 20px;">暂无答案记录</div>';
                    return;
                }
                
                const typeMap = {
                    '0': '单选题',
                    '1': '多选题',
                    '2': '判断题',
                    '3': '填空题',
                    '4': '简答题'
                };
                
                let html = '<div style="max-height: 400px; overflow-y: auto;">';
                let count = 0;
                const maxDisplay = 50; // 最多显示50条
                
                for (const key in answerDB) {
                    if (count >= maxDisplay) break;
                    const item = answerDB[key];
                    const typeName = typeMap[item.questionType || item.type || '0'] || '未知类型';
                    const questionContent = (item.questionContent || '').substring(0, 100);
                    const answer = Array.isArray(item.answer) ? item.answer.join(',') : item.answer;
                    
                    html += `
                        <div style="border: 1px solid #EBEEF5; border-radius: 4px; padding: 10px; margin-bottom: 10px; background: #fff;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-weight: bold; color: #303133;">${count + 1}. [${typeName}]</span>
                            </div>
                            <div style="color: #606266; margin-bottom: 6px; font-size: 12px; line-height: 1.5;">
                                <strong>题目：</strong>${this.escapeHtml(questionContent)}
                            </div>
                            <div style="color: #409EFF; margin-bottom: 6px; font-size: 12px;">
                                <strong>答案：</strong>${this.escapeHtml(answer || '无')}
                            </div>
                            ${item.solution ? `<div style="color: #909399; font-size: 11px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #EBEEF5;">
                                <strong>解析：</strong>${this.escapeHtml(item.solution.substring(0, 200))}
                            </div>` : ''}
                        </div>
                    `;
                    count++;
                }
                
                if (stats.total > maxDisplay) {
                    html += `<div style="color: #909399; text-align: center; padding: 10px; font-size: 12px;">共 ${stats.total} 条记录，仅显示前 ${maxDisplay} 条</div>`;
                }
                
                html += '</div>';
                container.innerHTML = html;
            },
    
            updateStatus: function(text) {
                const statusElement = document.getElementById('czbkStatusText');
                if (statusElement) {
                    statusElement.textContent = text;
                }
            },
            
            // 更新答案库统计显示
            updateStats: function() {
                this.updateAnswerCount();
                this.updateRecordCount();
                this.updateAnswerRecordDisplay();
            },
    
            updateLogs: function() {
                const logContainer = document.getElementById('czbkLogContainer');
                if (!logContainer) return;
    
                if (answerLogs.length === 0) {
                    logContainer.innerHTML = '<div style="color: #909399; text-align: center; padding: 10px;">暂无日志</div>';
                    return;
                }
    
                const logHtml = answerLogs.map(log => {
                    let color = '#606266';
                    if (log.message.includes('成功') || log.message.includes('完成')) {
                        color = '#67C23A';
                    } else if (log.message.includes('失败') || log.message.includes('错误')) {
                        color = '#F56C6C';
                    } else if (log.message.includes('开始') || log.message.includes('加载')) {
                        color = '#4285F4';
                    }
    
                    return `
                        <div style="margin-bottom: 4px; line-height: 1.4;">
                            <span style="color: #909399; font-size: 10px;">[${log.time}]</span>
                            <span style="color: ${color};">${this.escapeHtml(log.message)}</span>
                        </div>
                    `;
                }).join('');
    
                logContainer.innerHTML = logHtml;
                logContainer.scrollTop = 0;
            },
    
            clearLogs: function() {
                answerLogs = [];
                this.updateLogs();
                utils.log('日志已清空');
            },
            
            copyLogs: function() {
                if (answerLogs.length === 0) {
                    alert('暂无日志可复制');
                    return;
                }
                
                const logText = answerLogs.map(log => {
                    return `[${log.time}] ${log.message}`;
                }).join('\n');
                
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(logText).then(() => {
                        utils.log('日志已复制到剪贴板');
                        const btn = document.getElementById('czbkCopyLogBtn');
                        const originalText = btn.textContent;
                        btn.textContent = '已复制';
                        btn.style.background = '#67C23A';
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.style.background = '#4285F4';
                        }, 2000);
                    }).catch(err => {
                        utils.log('复制失败:', err);
                        this.fallbackCopyLogs(logText);
                    });
                } else {
                    this.fallbackCopyLogs(logText);
                }
            },
            
            fallbackCopyLogs: function(text) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    utils.log('日志已复制到剪贴板（降级方案）');
                    const btn = document.getElementById('czbkCopyLogBtn');
                    const originalText = btn.textContent;
                    btn.textContent = '已复制';
                    btn.style.background = '#67C23A';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#4285F4';
                    }, 2000);
                } catch (err) {
                    alert('复制失败，请手动选择日志内容复制');
                } finally {
                    document.body.removeChild(textarea);
                }
            },
            
            escapeHtml: function(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },
            
            saveApiConfig: function() {
                const apiKeyInput = document.getElementById('czbkApiKeyInput');
                const apiUrlInput = document.getElementById('czbkApiUrlInput');
                
                if (!apiKeyInput || !apiUrlInput) return;
                
                const newApiKey = apiKeyInput.value.trim();
                const newApiUrl = apiUrlInput.value.trim();
                
                if (!newApiKey) {
                    alert('请输入API Key');
                    return;
                }
                
                apiKey = newApiKey;
                config.api.baseUrl = newApiUrl || config.api.baseUrl;
                
                GM_setValue('czbk_api_key', apiKey);
                GM_setValue('czbk_api_url', config.api.baseUrl);
                
                // 更新状态显示
                const statusElement = document.getElementById('czbkApiKeyStatus');
                if (statusElement) {
                    statusElement.textContent = '已配置';
                }
                const apiStatusElement = document.getElementById('czbkApiStatus');
                if (apiStatusElement) {
                    apiStatusElement.textContent = '已配置';
                    apiStatusElement.style.color = '#67C23A';
                }
                
                utils.log('API配置已保存');
                alert('API配置已保存！');
            },
            
            testApiConnection: async function() {
                const apiKeyInput = document.getElementById('czbkApiKeyInput');
                const apiUrlInput = document.getElementById('czbkApiUrlInput');
                
                if (!apiKeyInput || !apiUrlInput) return;
                
                const testApiKey = apiKeyInput.value.trim();
                const testApiUrl = apiUrlInput.value.trim() || config.api.baseUrl;
                
                if (!testApiKey) {
                    alert('请先输入API Key');
                    return;
                }
                
                const statusElement = document.getElementById('czbkApiStatus');
                if (statusElement) {
                    statusElement.textContent = '测试中...';
                    statusElement.style.color = '#4285F4';
                }
                
                try {
                    // 临时设置API Key用于测试
                    const originalApiKey = apiKey;
                    apiKey = testApiKey;
                    const originalBaseUrl = config.api.baseUrl;
                    config.api.baseUrl = testApiUrl;
                    
                    const response = await apiQuery.getKeyInfo();
                    
                    if (response && response.code === 1 && response.data) {
                        if (statusElement) {
                            statusElement.textContent = '✓ 连接成功';
                            statusElement.style.color = '#67C23A';
                        }
                        utils.log('API连接测试成功:', response);
                        const dailyRemaining = response.data.daily_limit - response.data.daily_queries;
                        alert('API连接测试成功！\n\n计划: ' + response.data.plan + 
                              '\n今日已用: ' + response.data.daily_queries + ' / ' + response.data.daily_limit +
                              '\n剩余次数: ' + dailyRemaining);
                    } else {
                        throw new Error(response?.message || 'API返回错误');
                    }
                    
                    // 恢复原始配置
                    apiKey = originalApiKey;
                    config.api.baseUrl = originalBaseUrl;
                } catch (error) {
                    if (statusElement) {
                        statusElement.textContent = '✗ 连接失败';
                        statusElement.style.color = '#F56C6C';
                    }
                    utils.log('API连接测试失败:', error.message || error);
                    alert('API连接测试失败：' + (error.message || error));
                }
            }
        };
    
    // ==================== 网络请求拦截器 ====================
    const networkInterceptor = {
        init: function() {
            // 检查响应数据是否是题目数据格式
            const isQuestionData = function(data) {
                if (!data) return false;
                // 检查是否是题目数据格式（resultObject格式）
                if (data.resultObject) {
                    const result = data.resultObject;
                    return !!(result.danxuan || result.duoxuan || result.panduan || result.tiankong || result.jieda);
                }
                // 检查是否是数组格式
                if (Array.isArray(data) && data.length > 0) {
                    const firstItem = data[0];
                    if (Array.isArray(firstItem) && firstItem.length > 0) {
                        return firstItem[0].id !== undefined;
                    }
                    return firstItem.id !== undefined;
                }
                return false;
            };

            // 处理题目数据
            const handleQuestionData = async function(data, source) {
                try {
                    if (isQuestionData(data)) {
                        utils.log(`检测到题目数据请求（${source}），自动加载...`);
                        
                        // 转换为答案库格式
                        let importData = {};
                        if (data.resultObject) {
                            const result = data.resultObject;
                            const questionTypes = [
                                { key: 'danxuan', type: '0' },
                                { key: 'duoxuan', type: '1' },
                                { key: 'panduan', type: '2' },
                                { key: 'tiankong', type: '3' },
                                { key: 'jieda', type: '4' }
                            ];
                            
                            questionTypes.forEach(({ key, type }) => {
                                if (result[key] && result[key].lists) {
                                    result[key].lists.forEach(q => {
                                        const id = q.id || q.questionId;
                                        if (id) {
                                            importData[id] = {
                                                id: id,
                                                questionId: q.questionId || id,
                                                questionContent: q.questionContent || q.questionContentText || '',
                                                questionType: type,
                                                answer: q.answer || '',
                                                solution: q.solution || '',
                                                timestamp: Date.now()
                                            };
                                        }
                                    });
                                }
                            });
                        } else if (Array.isArray(data)) {
                            // 处理数组格式
                            const flattenArray = (arr) => {
                                const result = [];
                                for (const item of arr) {
                                    if (Array.isArray(item)) {
                                        result.push(...flattenArray(item));
                                    } else if (item && typeof item === 'object' && item.id) {
                                        result.push(item);
                                    }
                                }
                                return result;
                            };
                            
                            const flatData = flattenArray(data);
                            flatData.forEach(q => {
                                const id = q.id || q.questionId;
                                if (id) {
                                    importData[id] = {
                                        id: id,
                                        questionId: q.questionId || id,
                                        questionContent: q.questionContent || '',
                                        questionType: q.type || q.questionType || '0',
                                        answer: q.answer || '',
                                        solution: q.solution || '',
                                        timestamp: Date.now()
                                    };
                                }
                            });
                        }
                        
                        if (Object.keys(importData).length > 0) {
                            const result = answerDBManager.merge(importData);
                            if (controlPanel) {
                                controlPanel.updateStats();
                            }
                            utils.log(`已自动从网络请求加载题目数据，共 ${Object.keys(importData).length} 道题目`);
                            return true;
                        }
                    }
                } catch (e) {
                    utils.log('解析题目数据失败:', e);
                }
                return false;
            };

            // 拦截 fetch 请求
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0] || '';
                const response = await originalFetch.apply(this, args);
                
                // 检查响应内容是否为题目数据
                try {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const clonedResponse = response.clone();
                        const data = await clonedResponse.json();
                        
                        if (isQuestionData(data)) {
                            handleQuestionData(data, 'fetch');
                        }
                    }
                } catch (e) {
                    // 忽略解析错误
                }
                
                return response;
            };

            // 拦截 XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._url = url;
                this._method = method;
                return originalOpen.apply(this, [method, url, ...rest]);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
                const xhr = this;
                
                xhr.addEventListener('load', function() {
                    try {
                        let data = null;
                        if (xhr.responseType === '' || xhr.responseType === 'text') {
                            const responseText = xhr.responseText;
                            if (responseText) {
                                try {
                                    data = JSON.parse(responseText);
                                } catch (e) {
                                    return;
                                }
                            }
                        } else if (xhr.responseType === 'json') {
                            data = xhr.response;
                        }
                        
                        if (data && isQuestionData(data)) {
                            handleQuestionData(data, 'XHR');
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                });
                
                return originalSend.apply(this, args);
            };
            
            utils.log('网络请求拦截器已启动，将自动检测并加载题目数据');
        }
    };

    // ==================== 初始化 ====================
    const init = async function() {
        if (isInitialized) return;
        isInitialized = true;

        utils.log('脚本初始化开始...');

        // 1. 加载API Key和配置
        apiKey = GM_getValue('czbk_api_key', '');
        const savedApiUrl = GM_getValue('czbk_api_url', '');
        if (savedApiUrl) {
            config.api.baseUrl = savedApiUrl;
        }

        if (!apiKey) {
            const input = prompt('请输入API Key（留空可稍后配置）:');
            if (input) {
                apiKey = input.trim();
                GM_setValue('czbk_api_key', apiKey);
                utils.log('API Key已保存');
            }
        }

        // 2. 加载本地答案库
        answerDBManager.load();

        // 3. 启动网络请求拦截器
        networkInterceptor.init();

        // 4. 初始化UI
        ui.init();

        // 5. 如果是答题页面且启用自动答题
        const questionItems = document.querySelectorAll('.question-item, [data-id], .questionItem');
        if (questionItems.length > 0 && config.features.autoAnswer) {
            utils.log('检测到答题页面，开始自动答题...');
            setTimeout(() => {
                autoAnswer.start();
            }, 2000);
        }

        // 6. 如果是视频页面，自动播放
        if (courseAuto.isVideoPage() && config.features.autoAnswer) {
            setTimeout(() => {
                courseAuto.autoPlay();
            }, 1000);
        }

        utils.log('脚本初始化完成');
    };

    // 页面加载完成后初始化
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        window.addEventListener('load', () => setTimeout(init, 500));
    }

    // 监听页面变化（SPA应用）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            isInitialized = false;
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();