// ==UserScript==
// @name         懒羊羊自动化平台 - 传智播客答题脚本|刷课脚本|AI答题|Vue3+ElementPlus
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
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ================优化一下==== 配置区域 ====================
    const config = {
        // API配置
        api: {
            baseUrl: 'http://localhost:8000',  // 本地开发使用localhost，部署后改为服务器地址
            searchEndpoint: '/api/search',
            aiEndpoint: '/api/ai/answer',
            keyInfoEndpoint: '/api/key/info',
            uploadEndpoint: '/api/upload',  // 上传题库接口
            modelsEndpoint: '/api/models'  // 获取模型列表接口
        },
        
        // 功能开关
        features: {
            autoAnswer: false,        // 自动答题（默认关闭）
            autoSubmit: false,        // 自动提交（默认关闭）
            skipAnswered: true,       // 跳过已答题
            useAI: true,              // 启用AI答题
            showControlPanel: true,   // 显示控制面板
            useVueUI: true,          // 使用Vue3 + Antdv UI
            autoUploadToCloud: true,  // 自动上传拦截到的题目数据到云端（默认开启）
            autoCorrectAnswer: true   // 自动纠错：根据批改响应自动修正错误答案（默认开启）
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
            timeout: 90000,  // AI答题超时时间（90秒，思考模式可能需要更长时间）
            model: 'deepseek-chat',  // 默认使用DeepSeek-V3.2-Exp非思考模式（快速响应）
            temperature: 0.3,
            // 预设模型列表
            presetModels: [
                {
                    id: 'deepseek-chat',
                    name: 'DeepSeek V3.2-Exp (快速模式)',
                    provider: 'DeepSeek',
                    description: 'DeepSeek-V3.2-Exp 非思考模式，快速响应，适合快速答题和常规题目',
                    baseUrl: 'https://api.deepseek.com/v1',
                    features: ['快速响应', '中文支持好', '性价比高', '适合快速答题']
                },
                {
                    id: 'deepseek-reasoner',
                    name: 'DeepSeek V3.2-Exp (思考模式)',
                    provider: 'DeepSeek',
                    description: 'DeepSeek-V3.2-Exp 思考模式，深度推理，适合复杂逻辑题和需要深度思考的题目',
                    baseUrl: 'https://api.deepseek.com/v1',
                    features: ['深度推理', '逻辑思维强', '错误率低', '适合复杂题']
                }
            ]
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

        getQuestionId: function(element) {
            // 方法1: 从data-id属性获取
            let id = element.getAttribute('data-id') || 
                     element.closest('[data-id]')?.getAttribute('data-id');
            if (id) return id;
            
            // 方法2: 从题目文本生成ID（用于习题页面）
            const questionText = this.getQuestionText(element);
            if (questionText) {
                // 使用题目文本的前50个字符生成一个简单的hash作为ID
                const hash = questionText.substring(0, 50).split('').reduce((a, b) => {
                    a = ((a << 5) - a) + b.charCodeAt(0);
                    return a & a;
                }, 0);
                return 'q_' + Math.abs(hash).toString(36);
            }
            
            return null;
        },

        getQuestionText: function(element) {
            // 方法1: 从标准题目结构获取
            let titleBox = element.querySelector('.question-title-box .myEditorTxt');
            if (titleBox) return titleBox.textContent.trim();
            
            // 方法2: 从习题页面结构获取
            titleBox = element.querySelector('.question-title-box .question-title-text');
            if (titleBox) return titleBox.textContent.trim();
            
            // 方法3: 从题目标题容器获取
            titleBox = element.querySelector('.question-title-box');
            if (titleBox) {
                const text = titleBox.textContent.trim();
                // 移除题号（如"1、"）
                return text.replace(/^\d+[、.]\s*/, '');
            }
            
            // 方法4: 从整个元素获取文本（备用）
            const allText = element.textContent || '';
            if (allText) {
                // 尝试提取题目部分（通常在第一个选项之前）
                const match = allText.match(/^[^A-Z]*/);
                if (match) return match[0].trim();
            }
            
            return '';
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

        getAll: function() {
            return answerDB;
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
                    },
                    timeout: 15000  // 15秒超时
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

        aiAnswer: async function(questionData, model = null) {
            if (!config.features.useAI) {
                throw new Error('AI功能未启用');
            }

            // 使用传入的模型或配置的默认模型
            const useModel = model || config.ai.model;

            // 检查是否是自定义模型（自定义模型有baseUrl，可以直接使用前端发送请求）
            const customModels = JSON.parse(GM_getValue('czbk_custom_models', '[]'));
            const allPresetModels = config.ai.presetModels || [];
            const customModel = customModels.find(m => m.id === useModel);
            const presetModel = allPresetModels.find(m => m.id === useModel);
            
            // 如果是自定义模型且有baseUrl，直接使用前端发送请求
            if (customModel && customModel.baseUrl) {
                utils.log('使用自定义模型，直接前端发送请求:', customModel.name);
                return await this.aiAnswerDirect(questionData, customModel);
            }
            
            // 预设模型应该通过后端API调用（后端有DeepSeek API Key配置）
            // 只有自定义模型才直接使用前端发送请求（如果用户配置了自己的API Key）
            // 如果是预设模型且有baseUrl，也通过后端API调用（确保使用后端配置的DeepSeek API Key）
            if (presetModel && presetModel.baseUrl) {
                utils.log('使用预设模型，通过后端API调用:', presetModel.name);
                // 继续执行下面的后端API调用逻辑
            }

            // 使用后端API（需要API Key）
            if (!apiKey) {
                throw new Error('未配置API Key，无法使用AI答题');
            }

            try {
                const response = await utils.request({
                    method: 'POST',
                    url: `${config.api.baseUrl}${config.api.aiEndpoint}`,
                    data: {
                        questionContent: questionData.questionText,
                        type: questionData.questionType,
                        options: questionData.options,
                        platform: 'czbk',
                        model: useModel  // 传递模型参数（后端需要支持）
                    },
                    timeout: config.ai.timeout
                });

                utils.log('AI答题响应:', JSON.stringify(response).substring(0, 200));
                
                if (response.code === 1 && response.data) {
                    utils.log('AI答题成功，解析答案...');
                    return {
                        found: true,
                        answer: response.data.answer || [],
                        solution: response.data.solution,
                        confidence: response.data.confidence || 0.8,
                        source: response.data.source || 'ai'
                    };
                }
                
                // 如果响应格式不对，记录详细信息
                utils.log('AI答题响应格式异常:', {
                    code: response.code,
                    hasData: !!response.data,
                    message: response.message
                });
                throw new Error(response.message || `AI答题失败: code=${response.code}`);
            } catch (e) {
                utils.log('AI答题失败:', e);
                throw e;
            }
        },

        // 直接使用前端发送AI请求（用于自定义模型和预设模型）
        aiAnswerDirect: async function(questionData, modelConfig) {
            if (!modelConfig.baseUrl) {
                throw new Error('模型配置缺少baseUrl');
            }

            // 获取API Key（自定义模型可能需要自己的API Key）
            // 优先使用模型配置的API Key，否则使用全局API Key（从window或GM_getValue获取最新值）
            const currentApiKey = window.apiKey || GM_getValue('czbk_api_key', '');
            const modelApiKey = modelConfig.apiKey || currentApiKey;
            if (!modelApiKey) {
                utils.log('⚠️ 未配置API Key，无法直接调用AI API');
                utils.log('   提示：预设模型应通过后端API调用，自定义模型需要配置自己的API Key');
                throw new Error('未配置API Key');
            }
            
            utils.log(`使用API Key: ${modelApiKey.substring(0, 10)}... (长度: ${modelApiKey.length})`);

            try {
                // 构建题目提示词
                let prompt = `请回答以下${questionData.questionType}题：\n\n${questionData.questionText}\n\n`;
                
                if (questionData.options && questionData.options.length > 0) {
                    prompt += '选项：\n';
                    questionData.options.forEach((opt, idx) => {
                        prompt += `${String.fromCharCode(65 + idx)}. ${opt}\n`;
                    });
                }
                
                prompt += '\n请只返回答案选项（如：A、B、C、D 或 多个选项用逗号分隔），不要包含其他解释。';

                // 调用AI API（DeepSeek格式）
                const response = await utils.request({
                    method: 'POST',
                    url: `${modelConfig.baseUrl}/chat/completions`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${modelApiKey}`
                    },
                    data: {
                        model: modelConfig.id.includes('reasoner') ? 'deepseek-reasoner' : 'deepseek-chat',
                        messages: [
                            {
                                role: 'system',
                                content: '你是一个专业的答题助手，请准确回答题目，只返回答案选项。'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: modelConfig.temperature || config.ai.temperature || 0.3,
                        max_tokens: 500
                    },
                    timeout: config.ai.timeout
                });

                utils.log('直接AI请求响应:', JSON.stringify(response).substring(0, 200));
                
                // 解析响应（DeepSeek格式）
                if (response.choices && response.choices.length > 0) {
                    const answerText = response.choices[0].message.content.trim();
                    utils.log('AI返回答案文本:', answerText);
                    
                    // 提取答案选项（A、B、C、D等）
                    const answerMatch = answerText.match(/[A-Z](?:[,\s]*[A-Z])*/);
                    let answer = [];
                    if (answerMatch) {
                        answer = answerMatch[0].split(/[,\s]+/).filter(a => a);
                    } else {
                        // 如果没有匹配到，尝试提取第一个字母
                        const firstLetter = answerText.match(/^[A-Z]/);
                        if (firstLetter) {
                            answer = [firstLetter[0]];
                        }
                    }
                    
                    return {
                        found: true,
                        answer: answer,
                        solution: answerText,
                        confidence: 0.8,
                        source: 'ai'
                    };
                }
                
                throw new Error('AI响应格式异常');
            } catch (e) {
                // 改进错误信息显示
                const errorMessage = e.message || e.toString() || '未知错误';
                // 检查是否是 HTTP 401 错误（未授权）
                if (errorMessage.includes('401') || errorMessage.includes('HTTP 401')) {
                    utils.log('直接AI请求失败: HTTP 401 - API Key无效或未配置');
                    throw new Error('HTTP 401 - API Key无效或未配置，请检查API Key配置');
                } else {
                    utils.log('直接AI请求失败:', errorMessage);
                    throw e;
                }
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
        },

        getModels: async function() {
            // 不需要API Key也可以获取模型列表（如果后端支持）
            try {
                const response = await utils.request({
                    method: 'GET',
                    url: `${config.api.baseUrl}${config.api.modelsEndpoint}`,
                    timeout: 10000,
                    headers: apiKey ? {
                        'Authorization': `Bearer ${apiKey}`,
                        'X-API-Key': apiKey
                    } : {}
                });

                // 支持多种响应格式
                let models = [];
                
                // 格式1: { code: 1, data: [...] }
                if (response.code === 1 && response.data) {
                    if (Array.isArray(response.data)) {
                        models = response.data;
                    } else if (response.data.models && Array.isArray(response.data.models)) {
                        models = response.data.models;
                    } else if (response.data.list && Array.isArray(response.data.list)) {
                        models = response.data.list;
                    }
                }
                // 格式2: { success: true, data: [...] }
                else if (response.success && response.data) {
                    if (Array.isArray(response.data)) {
                        models = response.data;
                    } else if (response.data.models && Array.isArray(response.data.models)) {
                        models = response.data.models;
                    }
                }
                // 格式3: 直接是数组
                else if (Array.isArray(response)) {
                    models = response;
                }
                // 格式4: { models: [...] }
                else if (response.models && Array.isArray(response.models)) {
                    models = response.models;
                }
                // 格式5: { result: [...] }
                else if (response.result && Array.isArray(response.result)) {
                    models = response.result;
                }
                // 格式6: { items: [...] }
                else if (response.items && Array.isArray(response.items)) {
                    models = response.items;
                }

                utils.log(`后端返回模型数据格式解析完成，原始数据:`, response);
                utils.log(`解析出${models.length}个模型`);

                // 验证和格式化模型数据
                return models.map(model => {
                    // 确保模型有必需的字段，支持多种后端数据格式
                    const formattedModel = {
                        id: model.id || model.model_id || model.modelId || model.name || '',
                        name: model.name || model.model_name || model.modelName || model.id || '',
                        provider: model.provider || model.vendor || model.brand || 'Unknown',
                        description: model.description || model.desc || model.intro || '',
                        baseUrl: model.baseUrl || model.base_url || model.endpoint || model.apiUrl || model.api_url || null,
                        features: Array.isArray(model.features) ? model.features : 
                                 (Array.isArray(model.tags) ? model.tags : 
                                  (typeof model.features === 'string' ? model.features.split(',').map(f => f.trim()) : [])),
                        temperature: model.temperature || model.temp || 0.3,
                        maxTokens: model.maxTokens || model.max_tokens || model.maxTokens || 2000,
                        // 保留原始数据中的其他字段
                        ...model
                    };
                    
                    // 确保id和name不为空
                    if (!formattedModel.id || !formattedModel.name) {
                        return null;
                    }
                    
                    return formattedModel;
                }).filter(model => model !== null && model.id && model.name); // 过滤无效模型
                
            } catch (e) {
                utils.log('获取模型列表失败:', e);
                // 不抛出错误，返回空数组，让前端使用默认模型
                return [];
            }
        }
    };

    // ==================== 答案填充模块 ====================
    const answerFiller = {
        fillDanxuan: async function(questionItem, answer) {
            utils.log(`开始填充单选题答案: ${answer}`);
            
            // 方法1: 直接通过value查找radio input（标准方式，支持Element Plus）
            // 答案可能是 "0", "1", "2", "3" 或 "A", "B", "C", "D"
            let targetValue = answer;
            if (typeof answer === 'string') {
                const answerUpper = answer.trim().toUpperCase();
                // 如果是字母（A,B,C,D），转换为数字索引
                if (/^[A-Z]$/.test(answerUpper)) {
                    targetValue = (answerUpper.charCodeAt(0) - 65).toString(); // A=0, B=1, C=2, D=3
                    utils.log(`答案 "${answer}" 转换为value: ${targetValue}`);
                }
            } else if (typeof answer === 'number') {
                targetValue = answer.toString();
            }
            
            // 查找对应value的radio input
            let radio = questionItem.querySelector(`input[type="radio"][value="${targetValue}"]`);
            if (radio) {
                // Element Plus的radio结构：label.el-radio > input.el-radio__original
                const label = radio.closest('label.el-radio');
                if (label) {
                    // 点击label（Element Plus推荐方式）
                    label.click();
                    await utils.sleep(config.answer.delay);
                    // 验证是否选中
                    if (radio.checked || label.classList.contains('is-checked')) {
                        utils.log(`✅ 单选题已选择: value=${targetValue} (${answer})`);
                        return true;
                    }
                } else {
                    // 标准radio，直接点击
                    radio.click();
                    await utils.sleep(config.answer.delay);
                    if (radio.checked) {
                        utils.log(`✅ 单选题已选择: value=${targetValue} (${answer})`);
                        return true;
                    }
                }
            }
            
            // 方法2: 通过选项索引匹配（用于Element Plus，当value不匹配时）
            const optionSelectors = [
                '.question-option-item',
                '.el-radio-group label.el-radio',
                'label.el-radio'
            ];
            
            let optionItems = [];
            for (const selector of optionSelectors) {
                optionItems = questionItem.querySelectorAll(selector);
                if (optionItems.length > 0) {
                    utils.log(`找到 ${optionItems.length} 个选项（使用选择器: ${selector}）`);
                    break;
                }
            }
            
            if (optionItems.length === 0) {
                utils.log(`❌ 未找到选项元素`);
                return false;
            }
            
            let targetIndex = -1;
            
            // 尝试将答案转换为索引
            if (typeof answer === 'string') {
                const answerUpper = answer.trim().toUpperCase();
                // 如果是字母（A,B,C,D），转换为索引
                if (/^[A-Z]$/.test(answerUpper)) {
                    targetIndex = answerUpper.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
                    utils.log(`答案 "${answer}" 转换为索引: ${targetIndex}`);
                } else if (/^\d+$/.test(answerUpper)) {
                    targetIndex = parseInt(answerUpper, 10);
                    utils.log(`答案 "${answer}" 解析为索引: ${targetIndex}`);
                }
            } else if (typeof answer === 'number') {
                targetIndex = answer;
            }
            
            // 如果找到了目标索引，点击对应的选项
            if (targetIndex >= 0 && targetIndex < optionItems.length) {
                const targetOption = optionItems[targetIndex];
                utils.log(`尝试选择第 ${targetIndex} 个选项`);
                
                // Element Plus结构：label.el-radio > input.el-radio__original
                const radioInput = targetOption.querySelector('input[type="radio"]');
                const label = targetOption.closest('label.el-radio') || targetOption;
                
                // 点击label（Element Plus推荐方式）
                if (label) {
                    label.click();
                    await utils.sleep(config.answer.delay);
                    // 验证
                    if (radioInput && (radioInput.checked || label.classList.contains('is-checked'))) {
                        utils.log(`✅ 单选题已选择: 选项${targetIndex} (${answer})`);
                        return true;
                    }
                }
                
                // 如果label点击失败，尝试直接点击radio input
                if (radioInput) {
                    radioInput.click();
                    await utils.sleep(config.answer.delay);
                    if (radioInput.checked) {
                        utils.log(`✅ 单选题已选择: 选项${targetIndex} (${answer})`);
                        return true;
                    }
                }
            }
            
            // 方法3: 通过选项文本内容匹配（备用）
            for (let i = 0; i < optionItems.length; i++) {
                const optionText = optionItems[i].textContent.trim();
                // 检查选项文本是否包含答案（用于模糊匹配）
                if (optionText && typeof answer === 'string' && optionText.includes(answer)) {
                    const radioInput = optionItems[i].querySelector('input[type="radio"]');
                    const label = optionItems[i].closest('label.el-radio') || optionItems[i];
                    
                    if (label) label.click();
                    else if (radioInput) radioInput.click();
                    else optionItems[i].click();
                    
                    await utils.sleep(config.answer.delay);
                    if (radioInput && radioInput.checked) {
                        utils.log(`✅ 单选题已选择: ${optionText.substring(0, 30)}...`);
                        return true;
                    }
                }
            }
            
            utils.log(`❌ 单选题选择失败: 未找到答案 "${answer}" 对应的选项`);
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
            try {
                const questionId = utils.getQuestionId(questionItem);
                let questionText = utils.getQuestionText(questionItem);
                const questionType = utils.getQuestionType(questionItem);
                
                if (!questionText) {
                    utils.log('⚠️ 无法识别题目内容，尝试使用备用方法...');
                    // 尝试备用方法获取题目文本
                    const allText = questionItem.textContent || '';
                    if (!allText || allText.trim().length < 5) {
                        utils.log('❌ 题目内容为空，跳过');
                        return {
                            found: false,
                            message: '无法识别题目内容'
                        };
                    }
                    // 使用前100个字符作为题目文本
                    questionText = allText.substring(0, 100).trim();
                    utils.log(`使用备用方法获取题目文本: ${questionText.substring(0, 30)}...`);
                }

                // 提取选项（支持多种结构）
                const options = [];
                const optionSelectors = [
                    '.question-option-item',
                    '.el-radio-group .el-radio',
                    '.el-radio',
                    '.question-options-box .question-option-item'
                ];
                
                let optionItems = [];
                for (const selector of optionSelectors) {
                    optionItems = questionItem.querySelectorAll(selector);
                    if (optionItems.length > 0) break;
                }
                
                optionItems.forEach(item => {
                    // 提取选项文本（移除选项标记如A、B、C、D等）
                    let text = item.textContent.trim();
                    // 移除Element Plus的radio标记
                    text = text.replace(/^[A-Z][、.]\s*/, '').trim();
                    // 移除选项框中的其他标记
                    const optionText = item.querySelector('.options-item-text, .el-radio__label, .point-text');
                    if (optionText) {
                        text = optionText.textContent.trim();
                    }
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

                // 2. 查询云端API（添加超时保护）
                try {
                    utils.log('正在查询云端API...');
                    // 使用 Promise.race 添加超时保护（15秒）
                    const searchPromise = apiQuery.search(questionData).catch(e => {
                        utils.log('云端API查询Promise被reject:', e.message || e);
                        throw e;
                    });
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => {
                            utils.log('云端API查询超时（15秒），取消请求');
                            reject(new Error('云端API查询超时（15秒）'));
                        }, 15000)
                    );
                    
                    try {
                        result = await Promise.race([searchPromise, timeoutPromise]);
                        utils.log('云端API查询Promise完成，检查结果...');
                        if (result && result.found) {
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
                        } else {
                            utils.log('云端API未找到答案');
                        }
                    } catch (raceError) {
                        utils.log('云端API Promise.race错误:', raceError.message || raceError);
                        throw raceError;
                    }
                } catch (e) {
                    utils.log('云端API查询失败，尝试AI答题:', e.message || e);
                    console.error('云端API查询异常详情:', e);
                }

                // 3. AI答题（如果启用，添加超时保护）
                if (config.features.useAI) {
                    try {
                        utils.log('正在使用AI答题...');
                        // 获取当前选择的模型
                        const currentModel = GM_getValue('czbk_ai_model', config.ai.model);
                        utils.log(`使用AI模型: ${currentModel}`);
                        
                        // 使用 Promise.race 添加超时保护（90秒）
                        const aiPromise = apiQuery.aiAnswer(questionData, currentModel).catch(e => {
                            utils.log('AI答题Promise被reject:', e.message || e);
                            throw e;
                        });
                        const aiTimeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => {
                                utils.log('AI答题超时（90秒），取消请求');
                                reject(new Error('AI答题超时（90秒）'));
                            }, 90000)
                        );
                        
                        try {
                            result = await Promise.race([aiPromise, aiTimeoutPromise]);
                            utils.log('AI答题Promise完成，检查结果...');
                            if (result && result.found) {
                                utils.log('AI答题成功，答案:', result.answer);
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
                            } else {
                                utils.log('AI答题返回结果但found=false');
                            }
                        } catch (raceError) {
                            utils.log('Promise.race错误:', raceError.message || raceError);
                            throw raceError;
                        }
                    } catch (e) {
                        utils.log('AI答题失败:', e.message || e);
                        console.error('AI答题异常详情:', e);
                        // 即使AI答题失败，也继续处理，不中断流程
                    }
                }

                // 未找到答案
                return {
                    found: false,
                    questionData,
                    message: '未找到答案'
                };
            } catch (e) {
                utils.log(`❌ 查询答案时发生异常: ${e.message || e}`);
                console.error('queryAnswer.query 异常:', e);
                return {
                    found: false,
                    message: `查询失败: ${e.message || e}`
                };
            }
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
            // 视频页面必须有video元素，并且在播放容器中
            const video = document.querySelector('video');
            const playContainer = document.querySelector('.preview_play-container');
            
            // 如果有video元素，检查是否在播放容器中
            if (video && playContainer) {
                // 检查video是否在播放容器内
                const videoInContainer = playContainer.contains(video);
                // 检查是否有题目容器（如果有题目容器，可能是习题页面）
                const hasQuestionBox = document.querySelector('.answer-questions-box') !== null ||
                                      document.querySelector('.questions-lists-box') !== null;
                // 如果video在播放容器中，且没有题目容器，则是视频页面
                return videoInContainer && !hasQuestionBox;
            }
            
            // 备用判断：有播放容器但没有题目容器
            const hasPlayContainer = playContainer !== null ||
                                     document.querySelector('#videoPlayer') !== null ||
                                     document.querySelector('.video-play-box') !== null;
            const hasQuestionBox = document.querySelector('.answer-questions-box') !== null ||
                                  document.querySelector('.questions-lists-box') !== null;
            return hasPlayContainer && !hasQuestionBox && video !== null;
        },

        // 检测是否为习题页面
        isExercisePage: function() {
            // 习题页面必须有题目容器
            const hasQuestionBox = document.querySelector('.answer-questions-box') !== null ||
                                  document.querySelector('.questions-lists-box') !== null ||
                                  document.querySelector('.question-info-box') !== null;
            
            if (hasQuestionBox) {
                // 检查是否有视频播放容器，以及视频是否在主内容区
                const playContainer = document.querySelector('.preview_play-container');
                const video = playContainer ? playContainer.querySelector('video') : null;
                // 如果视频容器中没有video，或者根本没有视频容器，则是习题页面
                if (!video || !playContainer) {
                    return true;
                }
                // 如果视频在容器中，但题目容器也在，优先判断为习题页面
                return true;
            }
            return false;
        },

        // 获取当前课程信息（previewId和pointId）
        getCurrentCourseInfo: function() {
            try {
                // 从URL获取previewId
                const url = window.location.href;
                const previewMatch = url.match(/preview\/detail\/([a-f0-9]+)/i);
                const previewId = previewMatch ? previewMatch[1] : null;
                
                // 从当前播放的点获取pointId
                let pointId = null;
                const currentPoint = this.getCurrentPointItem();
                if (currentPoint) {
                    // 方法1: 尝试从data属性获取
                    pointId = currentPoint.getAttribute('data-point-id') || 
                              currentPoint.getAttribute('data-id') ||
                              currentPoint.getAttribute('id')?.replace('point_', '');
                    
                    // 方法2: 如果还是没找到，尝试从点击事件监听器获取
                    if (!pointId || pointId === 'undefined') {
                        // 尝试从Vue实例或页面全局变量获取
                        if (window.__vue__ || window.__VUE__) {
                            const vueInstance = window.__vue__ || window.__VUE__;
                            if (vueInstance.$data && vueInstance.$data.currentPointId) {
                                pointId = vueInstance.$data.currentPointId;
                            }
                        }
                    }
                    
                    // 方法3: 尝试从页面中的隐藏元素或脚本变量获取
                    if (!pointId || pointId === 'undefined') {
                        // 查找可能包含pointId的script标签
                        const scripts = document.querySelectorAll('script');
                        for (const script of scripts) {
                            const content = script.textContent || '';
                            const pointIdMatch = content.match(/pointId["\s:=]+([a-f0-9]+)/i);
                            if (pointIdMatch) {
                                pointId = pointIdMatch[1];
                                break;
                            }
                        }
                    }
                    
                    // 方法4: 尝试从当前视频播放器的数据属性获取
                    if (!pointId || pointId === 'undefined') {
                        const videoPlayer = document.querySelector('#videoPlayer, .video-play-box');
                        if (videoPlayer) {
                            pointId = videoPlayer.getAttribute('data-point-id') || 
                                     videoPlayer.getAttribute('data-id');
                        }
                    }
                }
                
                // 如果仍然没有找到，记录日志
                if (!pointId || pointId === 'undefined') {
                    utils.log('⚠️ 无法获取pointId，可能需要手动设置');
                }
                
                return { previewId, pointId };
            } catch (e) {
                utils.log('获取课程信息失败:', e);
                return { previewId: null, pointId: null };
            }
        },

        // 获取当前课程点元素
        getCurrentPointItem: function() {
            // 方法1: 查找带有 playing-status 类的点
            const playingPoint = document.querySelector('.point-item-box .point-name-box.playing-status');
            if (playingPoint) {
                return playingPoint.closest('.point-item-box');
            }
            
            // 方法2: 查找习题页面的当前点
            const playingExercise = document.querySelector('.point-item-box .point-topic-box.playing-status');
            if (playingExercise) {
                return playingExercise.closest('.point-item-box');
            }
            
            // 方法3: 查找带有 active 或 current 类的点
            const activePoint = document.querySelector('.point-item-box.active, .point-item-box.current');
            if (activePoint) {
                return activePoint;
            }
            
            // 方法4: 通过视频容器查找（如果视频正在播放）
            const video = document.querySelector('video');
            if (video && !video.paused) {
                // 查找包含视频的课程点（通过检查点是否在可见区域）
                const allPoints = document.querySelectorAll('.point-item-box');
                for (const point of allPoints) {
                    const pointNameBox = point.querySelector('.point-name-box');
                    if (pointNameBox) {
                        const progressBox = pointNameBox.querySelector('.point-progress-box');
                        // 如果这个点有进度信息，可能是当前点
                        if (progressBox) {
                            return point;
                        }
                    }
                }
            }
            
            return null;
        },

        // 获取下一个课程点（自动跳过100%的节点）
        getNextPointItem: function() {
            const currentPoint = this.getCurrentPointItem();
            if (!currentPoint) {
                // 如果没有当前点，返回第一个未完成的点
                const allPoints = document.querySelectorAll('.point-item-box');
                for (const point of allPoints) {
                    if (this.isPointCompleted(point)) {
                        continue; // 跳过已完成的点
                    }
                    return point;
                }
                return null;
            }

            // 获取下一个兄弟节点，跳过已完成的
            let nextPoint = currentPoint.nextElementSibling;
            while (nextPoint) {
                if (nextPoint.classList.contains('point-item-box')) {
                    // 检查是否已完成
                    if (!this.isPointCompleted(nextPoint)) {
                        return nextPoint;
                    }
                    // 如果已完成，继续查找下一个
                    utils.log(`检测到已完成节点（100%），自动跳过`);
                }
                nextPoint = nextPoint.nextElementSibling;
            }

            // 如果没有下一个，返回null（表示已完成所有课程）
            return null;
        },

        // 检查课程点是否已完成
        isPointCompleted: function(pointItem) {
            if (!pointItem) return true;
            
            let videoCompleted = false;
            let exerciseCompleted = true; // 默认没有习题则认为完成
            
            // 检查视频进度（多种方法）
            const videoProgressBox = pointItem.querySelector('.point-name-box .point-progress-box');
            if (videoProgressBox) {
                const videoProgress = videoProgressBox.textContent.trim();
                utils.log(`检查视频进度: "${videoProgress}"`);
                videoCompleted = (videoProgress === '100%');
            } else {
                // 方法2: 通过文本内容检查
                const pointNameBox = pointItem.querySelector('.point-name-box');
                if (pointNameBox) {
                    const pointText = pointNameBox.textContent || '';
                    // 检查是否有100%的文本
                    if (pointText.includes('100%')) {
                        utils.log('通过文本检测到100%完成');
                        videoCompleted = true;
                    } else {
                        // 方法3: 检查是否有完成标记类
                        const hasCompletedClass = pointNameBox.classList.contains('completed') || 
                                                 pointNameBox.classList.contains('finished') ||
                                                 pointItem.classList.contains('completed');
                        if (hasCompletedClass) {
                            utils.log('通过CSS类检测到完成');
                            videoCompleted = true;
                        }
                    }
                }
            }
            
            // 检查习题进度
            const exerciseBox = pointItem.querySelector('.point-topic-box');
            if (exerciseBox) {
                exerciseCompleted = false; // 有习题，需要检查
                const exerciseProgressBox = exerciseBox.querySelector('.point-progress-box');
                if (exerciseProgressBox) {
                    const exerciseProgress = exerciseProgressBox.textContent.trim();
                    utils.log(`检查习题进度: "${exerciseProgress}"`);
                    exerciseCompleted = (exerciseProgress === '100%');
                } else {
                    // 如果没有进度框，尝试通过文本检查
                    const exerciseText = exerciseBox.textContent || '';
                    if (exerciseText.includes('100%')) {
                        utils.log('通过文本检测到习题100%完成');
                        exerciseCompleted = true;
                    }
                }
            }
            
            const result = videoCompleted && exerciseCompleted;
            utils.log(`课程点完成状态: 视频=${videoCompleted}, 习题=${exerciseCompleted}, 总体=${result}`);
            return result;
        },

        // 点击课程点（视频或习题）
        clickPointItem: async function(pointItem, isExercise = false) {
            try {
                const targetBox = isExercise 
                    ? pointItem.querySelector('.point-topic-box')
                    : pointItem.querySelector('.point-name-box');
                
                if (targetBox) {
                    // 尝试点击
                    const clickable = targetBox.querySelector('.point-text-box, .point-text');
                    if (clickable) {
                        clickable.click();
                        await utils.sleep(1500);
                        utils.log(`已点击${isExercise ? '习题' : '视频'}点`);
                        return true;
                    } else {
                        targetBox.click();
                        await utils.sleep(1500);
                        utils.log(`已点击${isExercise ? '习题' : '视频'}点`);
                        return true;
                    }
                }
                return false;
            } catch (e) {
                utils.log('点击课程点失败:', e);
                return false;
            }
        },

        // 处理视频页面：完成当前视频并进入下一个
        handleVideoPage: async function() {
            try {
                // 首先检查是否是视频页面
                if (!this.isVideoPage()) {
                    utils.log('当前不是视频页面，跳过视频处理');
                    return false;
                }
                
                utils.log('开始处理视频页面...');
                
                // 0. 首先检查当前课程点是否已完成（100%），无论是否启用一键完成都要检查
                // 等待页面加载完成，确保DOM更新（增加等待时间）
                await utils.sleep(1500);
                
                // 尝试多次获取当前课程点（页面切换后可能需要时间更新）
                let currentPointItem = null;
                for (let retry = 0; retry < 5; retry++) {
                    currentPointItem = this.getCurrentPointItem();
                    if (currentPointItem) {
                        utils.log(`成功获取当前课程点（尝试 ${retry + 1}/5）`);
                        // 再等待一下，确保进度信息已更新
                        await utils.sleep(500);
                        break;
                    }
                    if (retry < 4) {
                        await utils.sleep(500);
                    }
                }
                
                if (currentPointItem) {
                    const isCompleted = this.isPointCompleted(currentPointItem);
                    utils.log(`当前课程点完成状态: ${isCompleted ? '已完成(100%)' : '未完成'}`);
                    
                    if (isCompleted) {
                        utils.log('当前视频已完成（100%），自动跳过进入下一个...');
                    // 直接进入下一个未完成的课程点
                    let nextPoint = this.getNextPointItem();
                    while (nextPoint && this.isPointCompleted(nextPoint)) {
                        utils.log(`检测到已完成节点（100%），自动跳过`);
                        const tempPoint = nextPoint;
                        nextPoint = tempPoint.nextElementSibling;
                        while (nextPoint && !nextPoint.classList.contains('point-item-box')) {
                            nextPoint = nextPoint.nextElementSibling;
                        }
                    }
                    
                    if (nextPoint) {
                        utils.log('准备进入下一个未完成的课程点...');
                        await this.clickPointItem(nextPoint, false);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isVideoPage() && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isVideoPage()) {
                            // 等待页面完全加载，确保DOM更新完成（增加等待时间）
                            await utils.sleep(2000);
                            // 再次检查是否启用一键完成
                            const instantFinishEnabled = GM_getValue('czbk_instant_finish', false);
                            if (instantFinishEnabled) {
                                // 如果启用一键完成，使用一键完成模式
                                return await this.instantFinishCourse();
                            } else {
                                // 否则正常处理视频
                                return await this.handleVideoPage();
                            }
                        } else if (this.isExercisePage()) {
                            // 进入习题页面，处理习题
                            return await this.handleExercisePage();
                        }
                    } else {
                        utils.log('所有课程已完成！');
                        return true;
                    }
                    } else {
                        utils.log('当前课程点未完成，继续处理视频');
                    }
                } else {
                    utils.log('⚠️ 无法获取当前课程点，继续处理视频（可能页面还在加载）');
                }
                
                // 1. 检查是否启用了一键完成（如果启用，直接快进到结尾，不播放）
                const instantFinishEnabled = GM_getValue('czbk_instant_finish_enabled', false);
                if (instantFinishEnabled) {
                    utils.log('检测到一键完成已启用，使用一键完成模式...');
                    return await this.instantFinishCourse();
                }
                
                const video = document.querySelector('video');
                if (!video) {
                    utils.log('未找到视频元素');
                    return false;
                }

                // 1. 如果视频未播放，开始播放
                if (video.paused) {
                    await video.play();
                    await utils.sleep(1000);
                    utils.log('视频已开始播放');
                }

                // 2. 设置播放速度（使用配置的播放速度，不强制快进）
                const playbackSpeed = GM_getValue('czbk_playback_speed', 2.0);
                if (video.playbackRate !== playbackSpeed) {
                    video.playbackRate = playbackSpeed;
                    utils.log(`视频播放速度设置为 ${playbackSpeed}x`);
                }

                // 3. 正常播放视频，等待视频自然结束（模拟人工观看）
                // 不再直接快进到结尾，让视频正常播放
                utils.log('视频正在播放中，等待播放完成...');

                // 4. 等待视频结束
                await new Promise((resolve) => {
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

                // 5. 尝试完成课程（调用系统完成函数）
                if (typeof window.finishWxCourse === 'function') {
                    window.finishWxCourse();
                    await utils.sleep(2000);
                    utils.log('已调用 finishWxCourse');
                }

                // 6. 检查是否有习题，如果有则进入习题页面并自动答题
                const currentPoint = this.getCurrentPointItem();
                if (currentPoint) {
                    const exerciseBox = currentPoint.querySelector('.point-topic-box');
                    const progressBox = exerciseBox?.querySelector('.point-progress-box');
                    const progress = progressBox?.textContent.trim() || '0%';
                    
                    // 如果习题未完成，进入习题页面
                    if (exerciseBox && progress !== '100%') {
                        utils.log('检测到未完成的习题，准备进入习题页面...');
                        await this.clickPointItem(currentPoint, true);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isExercisePage()) {
                            utils.log('已进入习题页面，准备自动答题...');
                            // 自动处理习题（包括自动答题）
                            const success = await this.handleExercisePage();
                            // 习题处理完成后，handleExercisePage 内部会处理进入下一个课程
                            return success;
                        }
                    }
                }

                // 7. 如果没有习题或习题已完成，进入下一个课程点（跳过100%的节点）
                let nextPoint = this.getNextPointItem();
                while (nextPoint && this.isPointCompleted(nextPoint)) {
                    utils.log(`检测到已完成节点（100%），自动跳过`);
                    // 继续查找下一个
                    const currentPoint = nextPoint;
                    nextPoint = currentPoint.nextElementSibling;
                    while (nextPoint && !nextPoint.classList.contains('point-item-box')) {
                        nextPoint = nextPoint.nextElementSibling;
                    }
                }
                
                if (nextPoint) {
                    utils.log('准备进入下一个课程点...');
                    await this.clickPointItem(nextPoint, false);
                    await utils.sleep(2000);
                    
                    // 等待页面切换
                    let retryCount = 0;
                    while (retryCount < 10 && !this.isVideoPage()) {
                        await utils.sleep(500);
                        retryCount++;
                    }
                    
                    if (this.isVideoPage()) {
                        utils.log('已进入下一个视频页面');
                        // 等待页面完全加载
                        await utils.sleep(2000);
                        // 检查是否启用一键完成
                        const instantFinishEnabled = GM_getValue('czbk_instant_finish_enabled', false);
                        if (instantFinishEnabled) {
                            // 如果启用一键完成，继续使用一键完成模式
                            return await this.instantFinishCourse();
                        } else {
                            // 否则正常处理视频
                            return await this.handleVideoPage();
                        }
                    } else {
                        utils.log('页面切换可能失败，请手动检查');
                    }
                } else {
                    utils.log('所有课程已完成！');
                }

                return true;
            } catch (e) {
                utils.log('处理视频页面失败:', e);
                return false;
            }
        },

        // 处理习题页面：答题并提交后进入下一个
        handleExercisePage: async function() {
            try {
                utils.log('开始处理习题页面...');

                // 1. 等待页面加载完成
                await utils.sleep(1000);

                // 2. 检查是否已经答题（支持多种选择器）
                const questionSelectors = [
                    '.question-info-box',
                    '.question-item',
                    '.questions-lists-box .question-info-box',
                    '.answer-questions-box .question-info-box'
                ];
                
                let questionItems = [];
                for (const selector of questionSelectors) {
                    questionItems = document.querySelectorAll(selector);
                    if (questionItems.length > 0) {
                        utils.log(`找到 ${questionItems.length} 道题目（使用选择器: ${selector}）`);
                        break;
                    }
                }
                
                if (questionItems.length === 0) {
                    utils.log('未找到题目，等待页面加载...');
                    await utils.sleep(2000);
                    // 再次尝试查找
                    for (const selector of questionSelectors) {
                        questionItems = document.querySelectorAll(selector);
                        if (questionItems.length > 0) break;
                    }
                    if (questionItems.length === 0) {
                        utils.log('仍未找到题目');
                        return false;
                    }
                }

                let allAnswered = true;
                for (const item of questionItems) {
                    // 检查是否已答题
                    const checkedRadio = item.querySelector('input[type="radio"]:checked');
                    const checkedCheckbox = item.querySelectorAll('input[type="checkbox"]:checked');
                    const fillInputs = item.querySelectorAll('input[type="text"]:not([type="radio"]):not([type="checkbox"]), input.tk_input');
                    const textarea = item.querySelector('textarea');
                    
                    if (!checkedRadio && checkedCheckbox.length === 0 && 
                        (!fillInputs.length || Array.from(fillInputs).every(inp => !inp.value || !inp.value.trim())) &&
                        (!textarea || !textarea.value || !textarea.value.trim())) {
                        allAnswered = false;
                        break;
                    }
                }

                // 3. 如果未答题，强制启用自动答题功能
                if (!allAnswered) {
                    utils.log(`检测到 ${questionItems.length} 道未答题，开始自动答题...`);
                    
                    // 临时启用自动答题功能
                    const originalAutoAnswer = config.features.autoAnswer;
                    config.features.autoAnswer = true;
                    
                    try {
                        if (typeof autoAnswer !== 'undefined' && typeof autoAnswer.start === 'function') {
                            // 等待一下确保autoAnswer已初始化
                            await utils.sleep(500);
                            await autoAnswer.start();
                            await utils.sleep(3000); // 等待答题完成
                            utils.log('自动答题已完成');
                        } else {
                            utils.log('⚠️ 自动答题功能未初始化');
                        }
                    } catch (e) {
                        utils.log('自动答题失败:', e);
                        // 即使答题失败，也继续提交流程（刷课模式）
                    } finally {
                        // 恢复原始设置
                        config.features.autoAnswer = originalAutoAnswer;
                    }
                } else {
                    utils.log('所有题目已答题');
                }

                // 3. 提交答案（即使没有找到答案，在刷课模式下也提交）
                // 尝试多种选择器查找提交按钮
                const submitSelectors = [
                    '.el-button--primary.el-button--big',
                    '.el-button.el-button--primary',
                    'button.el-button--primary',
                    'button[type="button"]'
                ];
                
                let submitBtn = null;
                for (const selector of submitSelectors) {
                    const buttons = document.querySelectorAll(selector);
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text.includes('提交') || text.includes('Submit')) {
                            submitBtn = btn;
                            break;
                        }
                    }
                    if (submitBtn) break;
                }
                
                if (submitBtn) {
                    submitBtn.click();
                    utils.log('已点击提交按钮');
                    await utils.sleep(2000);
                } else {
                    utils.log('⚠️ 未找到提交按钮');
                }

                // 4. 等待提交完成，检查是否有下一题
                await utils.sleep(2000);
                
                // 检查是否有"下一题"按钮（提交后可能出现）
                let nextQuestionBtn = null;
                // 查找所有按钮，检查文本内容
                const allButtons = document.querySelectorAll('button.el-button, button[type="button"], .el-button');
                for (const btn of allButtons) {
                    const text = btn.textContent.trim();
                    // 检查是否是下一题按钮（排除提交按钮）
                    if ((text.includes('下一题') || text.includes('下一道') || text.includes('Next')) && 
                        !text.includes('提交') && !text.includes('Submit')) {
                        nextQuestionBtn = btn;
                        utils.log(`找到下一题按钮: "${text}"`);
                        break;
                    }
                }
                
                // 如果有下一题，点击并继续答题
                if (nextQuestionBtn) {
                    utils.log('检测到下一题，继续答题...');
                    nextQuestionBtn.click();
                    await utils.sleep(2000);
                    
                    // 等待下一题加载（检查题目数量是否变化）
                    let retryCount = 0;
                    let previousQuestionCount = questionItems.length;
                    while (retryCount < 10) {
                        await utils.sleep(500);
                        const newQuestions = document.querySelectorAll('.question-info-box, .question-item, .questions-lists-box .question-info-box');
                        if (newQuestions.length > 0 && newQuestions.length !== previousQuestionCount) {
                            utils.log(`下一题已加载，共 ${newQuestions.length} 道题目`);
                            break;
                        }
                        retryCount++;
                    }
                    
                    // 递归处理下一题（继续自动答题）
                    return await this.handleExercisePage();
                } else {
                    utils.log('未找到下一题按钮，习题已完成');
                }

                // 5. 如果没有下一题，等待提交完成并检查是否进入下一个课程
                await utils.sleep(2000);
                
                // 6. 检查当前课程点的习题是否完成，然后进入下一个课程点（跳过100%的节点）
                const currentPoint = this.getCurrentPointItem();
                if (currentPoint) {
                    // 查找下一个未完成的课程点
                    let nextPoint = this.getNextPointItem();
                    while (nextPoint && this.isPointCompleted(nextPoint)) {
                        utils.log(`检测到已完成节点（100%），自动跳过`);
                        // 继续查找下一个
                        const tempPoint = nextPoint;
                        nextPoint = tempPoint.nextElementSibling;
                        while (nextPoint && !nextPoint.classList.contains('point-item-box')) {
                            nextPoint = nextPoint.nextElementSibling;
                        }
                    }
                    
                    if (nextPoint) {
                        utils.log('准备进入下一个课程点...');
                        await this.clickPointItem(nextPoint, false);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isVideoPage() && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isVideoPage()) {
                            utils.log('已进入下一个视频页面');
                            // 等待页面完全加载
                            await utils.sleep(2000);
                            // 检查是否启用一键完成
                            const instantFinishEnabled = GM_getValue('czbk_instant_finish', false);
                            if (instantFinishEnabled) {
                                // 如果启用一键完成，继续使用一键完成模式
                                return await this.instantFinishCourse();
                            } else {
                                // 否则正常处理视频
                                return await this.handleVideoPage();
                            }
                        } else if (this.isExercisePage()) {
                            utils.log('已进入下一个习题页面');
                            return true;
                        }
                    } else {
                        utils.log('所有课程已完成！');
                    }
                }

                return true;
            } catch (e) {
                utils.log('处理习题页面失败:', e);
                return false;
            }
        },

        // 一键完成课程（直接快进到结尾，然后调用API）
        instantFinishCourse: async function() {
            try {
                // 首先检查是否是视频页面
                if (!this.isVideoPage()) {
                    utils.log('❌ 当前不是视频页面，无法使用一键完成');
                    return false;
                }
                
                utils.log('⚠️ 开始一键完成课程（快进到结尾）...');
                
                // 0. 检查当前课程点是否已完成（100%）
                // 等待页面加载完成，确保DOM更新（增加等待时间）
                await utils.sleep(1500);
                
                let currentPointItem = null;
                for (let retry = 0; retry < 5; retry++) {
                    currentPointItem = this.getCurrentPointItem();
                    if (currentPointItem) {
                        utils.log(`一键完成：成功获取当前课程点（尝试 ${retry + 1}/5）`);
                        // 再等待一下，确保进度信息已更新
                        await utils.sleep(500);
                        break;
                    }
                    if (retry < 4) {
                        await utils.sleep(500);
                    }
                }
                
                if (currentPointItem && this.isPointCompleted(currentPointItem)) {
                    utils.log('当前视频已完成（100%），自动跳过进入下一个...');
                    // 直接进入下一个未完成的课程点
                    let nextPoint = this.getNextPointItem();
                    while (nextPoint && this.isPointCompleted(nextPoint)) {
                        utils.log(`检测到已完成节点（100%），自动跳过`);
                        const tempPoint = nextPoint;
                        nextPoint = tempPoint.nextElementSibling;
                        while (nextPoint && !nextPoint.classList.contains('point-item-box')) {
                            nextPoint = nextPoint.nextElementSibling;
                        }
                    }
                    
                    if (nextPoint) {
                        utils.log('准备进入下一个未完成的课程点...');
                        await this.clickPointItem(nextPoint, false);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isVideoPage() && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isVideoPage()) {
                            // 等待页面完全加载，确保DOM更新完成（增加等待时间）
                            await utils.sleep(2000);
                            // 递归处理下一个视频页面（继续使用一键完成）
                            return await this.instantFinishCourse();
                        } else if (this.isExercisePage()) {
                            // 进入习题页面，处理习题
                            return await this.handleExercisePage();
                        }
                    } else {
                        utils.log('所有课程已完成！');
                        return true;
                    }
                }
                
                const video = document.querySelector('video');
                if (!video) {
                    utils.log('❌ 未找到视频元素');
                    return false;
                }
                
                // 只做快进到结尾的操作
                if (video.duration) {
                    video.currentTime = video.duration - 1;
                    await utils.sleep(1000);
                    utils.log('视频已快进到结尾');
                    
                    // 等待视频结束
                    await new Promise((resolve) => {
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
                
                // 尝试完成课程（调用系统完成函数）
                if (typeof window.finishWxCourse === 'function') {
                    window.finishWxCourse();
                    await utils.sleep(2000);
                    utils.log('已调用 finishWxCourse');
                }
                
                // 等待进度更新
                await utils.sleep(2000);
                
                // 检查是否有习题，如果有则进入习题页面
                const currentPoint = this.getCurrentPointItem();
                if (currentPoint) {
                    const exerciseBox = currentPoint.querySelector('.point-topic-box');
                    const progressBox = exerciseBox?.querySelector('.point-progress-box');
                    const progress = progressBox?.textContent.trim() || '0%';
                    
                    // 如果习题未完成，进入习题页面
                    if (exerciseBox && progress !== '100%') {
                        utils.log('检测到未完成的习题，准备进入习题页面...');
                        await this.clickPointItem(currentPoint, true);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isExercisePage()) {
                            utils.log('已进入习题页面，准备自动答题...');
                            // 自动处理习题（包括自动答题）
                            await this.handleExercisePage();
                            return true;
                        }
                    }
                    
                    // 如果没有习题或习题已完成，进入下一个课程点
                    utils.log('视频已完成，准备进入下一个课程点...');
                    let nextPoint = this.getNextPointItem();
                    while (nextPoint && this.isPointCompleted(nextPoint)) {
                        utils.log(`检测到已完成节点（100%），自动跳过`);
                        const tempPoint = nextPoint;
                        nextPoint = tempPoint.nextElementSibling;
                        while (nextPoint && !nextPoint.classList.contains('point-item-box')) {
                            nextPoint = nextPoint.nextElementSibling;
                        }
                    }
                    
                    if (nextPoint) {
                        utils.log('准备进入下一个未完成的课程点...');
                        await this.clickPointItem(nextPoint, false);
                        await utils.sleep(2000);
                        
                        // 等待页面切换
                        let retryCount = 0;
                        while (retryCount < 10 && !this.isVideoPage() && !this.isExercisePage()) {
                            await utils.sleep(500);
                            retryCount++;
                        }
                        
                        if (this.isVideoPage()) {
                            // 等待页面完全加载，确保DOM更新完成
                            await utils.sleep(2000);
                            // 递归处理下一个视频页面（继续使用一键完成）
                            return await this.instantFinishCourse();
                        } else if (this.isExercisePage()) {
                            // 进入习题页面，处理习题
                            return await this.handleExercisePage();
                        }
                    } else {
                        utils.log('所有课程已完成！');
                        return true;
                    }
                }
                
                return true;
            } catch (e) {
                utils.log('❌ 一键完成课程失败:', e);
                return false;
            }
        },

        // 自动完成课程（正常流程）
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

            if (typeof controlPanel !== 'undefined' && controlPanel) {
                controlPanel.updateStatus('答题中...');
            }
            utils.log('开始批量自动答题...');
            
            let answeredCount = 0;

            // 处理单选题（支持多种选择器，包括习题页面）
            const danxuanSelectors = [
                '#danxuanQuestionBox .questionItem',
                '.question-item[data-type="0"]',
                '.question-item:has(input[type="radio"])',
                '.question-info-box:has(input[type="radio"])',
                '.questions-lists-box .question-info-box:has(input[type="radio"])',
                '.answer-questions-box .question-info-box:has(input[type="radio"])'
            ];
            let danxuanItems = [];
            for (const selector of danxuanSelectors) {
                danxuanItems = document.querySelectorAll(selector);
                if (danxuanItems.length > 0) break;
            }
            
            utils.log(`找到 ${danxuanItems.length} 道单选题，开始处理...`);
            for (let i = 0; i < danxuanItems.length; i++) {
                const item = danxuanItems[i];
                if (!this.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                
                utils.log(`处理第 ${i + 1}/${danxuanItems.length} 道单选题...`);
                const questionId = utils.getQuestionId(item);
                if (!questionId) {
                    utils.log(`⚠️ 无法获取题目ID，跳过`);
                    continue;
                }
                
                // 跳过已答题
                if (config.features.skipAnswered && utils.isQuestionAnswered(item)) {
                    utils.log(`题目已答，跳过: ${questionId}`);
                    continue;
                }
                
                // 查询答案
                try {
                    utils.log(`正在查询答案，题目ID: ${questionId}...`);
                    const result = await queryAnswer.query(item);
                    if (result.found) {
                        utils.log(`✅ 找到答案: ${result.answer}，开始填充...`);
                        const success = await answerFiller.fillDanxuan(item, result.answer);
                        if (success) {
                            answeredCount++;
                            this.correctNum++;
                            utils.log(`✅ 单选题已选择: ${result.answer}`);
                        } else {
                            utils.log(`❌ 单选题选择失败: ${result.answer}`);
                        }
                    } else {
                        utils.log(`⚠️ 未找到答案，题目ID: ${questionId}`);
                    }
                } catch (e) {
                    utils.log(`❌ 查询答案失败: ${e.message || e}`);
                    console.error('查询答案异常:', e);
                }
                await utils.sleep(config.answer.answerInterval * 1000);
            }
            utils.log(`单选题处理完成，共处理 ${danxuanItems.length} 道`);

            // 处理多选题
            const duoxuanSelectors = [
                '#duoxuanQuestionBox .questionItem',
                '.question-item[data-type="1"]',
                '.question-item:has(input[type="checkbox"])',
                '.question-info-box:has(input[type="checkbox"])',
                '.questions-lists-box .question-info-box:has(input[type="checkbox"])',
                '.answer-questions-box .question-info-box:has(input[type="checkbox"])'
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
                '.question-item[data-type="2"]',
                '.question-info-box:has(input[type="radio"]):has(.el-radio-group)',
                '.questions-lists-box .question-info-box:has(input[type="radio"]):has(.el-radio-group)',
                '.answer-questions-box .question-info-box:has(input[type="radio"]):has(.el-radio-group)'
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
                '.question-item:has(input.tk_input)',
                '.question-info-box:has(input[type="text"]:not([type="radio"]):not([type="checkbox"]))',
                '.questions-lists-box .question-info-box:has(input[type="text"]:not([type="radio"]):not([type="checkbox"]))',
                '.answer-questions-box .question-info-box:has(input[type="text"]:not([type="radio"]):not([type="checkbox"]))'
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
                '.question-item:has(.editor-box)',
                '.question-info-box:has(textarea)',
                '.questions-lists-box .question-info-box:has(textarea)',
                '.answer-questions-box .question-info-box:has(textarea)'
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
            } else if (config.features.autoSubmit && answeredCount === 0 && this.totalNum > 0) {
                // 如果没有找到任何答案，但启用了自动提交，也提交（刷课模式）
                utils.log('⚠️ 未找到答案，但启用自动提交，准备提交...');
                await this.submit();
            }

            this.isRunning = false;
            if (typeof controlPanel !== 'undefined' && controlPanel) {
                controlPanel.updateStatus('答题完成');
            }
        },

        stop: function() {
            this.isRunning = false;
            if (typeof controlPanel !== 'undefined' && controlPanel) {
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
                // 确保 autoAnswer 对象已暴露到全局
                if (!window.autoAnswer && typeof autoAnswer !== 'undefined') {
                    window.autoAnswer = autoAnswer;
                }
                
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

                // 添加自定义样式
                const customStyle = document.createElement('style');
                customStyle.textContent = `
                    #czbk-vue-panel-host {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        z-index: 99999;
                        animation: slideInRight 0.3s ease-out;
                    }
                    @keyframes slideInRight {
                        from {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    .czbk-panel-card {
                        border-radius: 12px !important;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
                        overflow: visible !important;
                    }
                    .czbk-panel-card .el-card__header {
                        background: #ffffff !important;
                        padding: 16px 20px !important;
                        border: none !important;
                        border-bottom: 1px solid #e4e7ed !important;
                    }
                    .czbk-panel-card .el-card__body {
                        padding: 20px !important;
                        background: #fafafa;
                        overflow: visible !important;
                    }
                    /* 修复下拉框z-index问题 */
                    #czbk-vue-panel-host .el-select-dropdown,
                    #czbk-vue-panel-host .el-popper,
                    #czbk-vue-panel-host [x-placement],
                    #czbk-vue-panel-host .el-dropdown-menu,
                    .czbk-select-dropdown {
                        z-index: 100000 !important;
                    }
                    /* 优化下拉框样式，使其更协调 */
                    .czbk-select-dropdown {
                        border-radius: 8px !important;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                        border: 1px solid #e4e7ed !important;
                        padding: 4px 0 !important;
                    }
                    .czbk-select-dropdown .el-select-dropdown__item {
                        padding: 10px 16px !important;
                        height: auto !important;
                        line-height: 1.5 !important;
                    }
                    .czbk-select-dropdown .el-select-dropdown__item:hover {
                        background-color: #f5f7fa !important;
                    }
                    .czbk-select-dropdown .el-option-group__title {
                        padding: 8px 16px !important;
                        font-size: 12px !important;
                        color: #909399 !important;
                        font-weight: 600 !important;
                        background-color: #fafafa !important;
                        border-bottom: 1px solid #e4e7ed !important;
                    }
                    .czbk-select-dropdown .el-option-group:not(:last-child) {
                        border-bottom: 1px solid #e4e7ed !important;
                    }
                    /* 确保所有Element Plus弹出层都在面板之上 */
                    body > .el-select-dropdown,
                    body > .el-popper,
                    body > [x-placement],
                    body > .el-dropdown__popper {
                        z-index: 100000 !important;
                    }
                    /* 修复配置页面对齐 */
                    .el-space--vertical > .el-space__item {
                        width: 100%;
                    }
                    .el-space--vertical > .el-space__item > * {
                        width: 100%;
                    }
                    .czbk-stat-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 10px 14px;
                        background: white;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                        transition: all 0.3s ease;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .czbk-stat-item:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    }
                    .czbk-stat-label {
                        font-size: 13px;
                        color: #606266;
                        font-weight: 500;
                        flex-shrink: 0;
                        margin-right: 12px;
                    }
                    .czbk-stat-value {
                        font-size: 14px;
                        font-weight: 600;
                        color: #303133;
                        text-align: right;
                        flex: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .czbk-log-item {
                        padding: 6px 8px;
                        margin-bottom: 4px;
                        border-radius: 4px;
                        font-size: 11px;
                        line-height: 1.5;
                        transition: background 0.2s;
                    }
                    .czbk-log-item:hover {
                        background: rgba(64, 158, 255, 0.1);
                    }
                    .czbk-log-time {
                        color: #909399;
                        margin-right: 8px;
                        font-family: 'Courier New', monospace;
                    }
                    .czbk-log-success {
                        color: #67c23a;
                    }
                    .czbk-log-error {
                        color: #f56c6c;
                    }
                    .czbk-log-warning {
                        color: #e6a23c;
                    }
                    .czbk-log-info {
                        color: #409eff;
                    }
                    .czbk-answer-item {
                        padding: 10px;
                        margin-bottom: 8px;
                        background: white;
                        border-radius: 6px;
                        border-left: 3px solid #409eff;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }
                    .czbk-answer-question {
                        font-weight: 500;
                        color: #303133;
                        margin-bottom: 6px;
                        font-size: 13px;
                    }
                    .czbk-answer-text {
                        color: #606266;
                        font-size: 12px;
                    }
                    .czbk-answer-source {
                        color: #909399;
                        font-size: 11px;
                        margin-top: 4px;
                    }
                    .czbk-progress-bar {
                        height: 6px;
                        background: #e4e7ed;
                        border-radius: 3px;
                        overflow: hidden;
                        margin: 8px 0;
                    }
                    .czbk-progress-fill {
                        height: 100%;
                        background: #409eff;
                        transition: width 0.3s ease;
                    }
                `;
                document.head.appendChild(customStyle);

                // 创建容器（不使用Shadow DOM，方便样式和交互）
                const host = document.createElement('div');
                host.id = 'czbk-vue-panel-host';
                // 初始位置设置为右侧，但会在Vue组件中根据保存的位置调整
                host.style.cssText = 'position: fixed; top: 10px; left: auto; right: 10px; z-index: 99999; user-select: none; display: block; visibility: visible;';
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
                const { createApp, ref, onMounted, computed } = VueObj;
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
                        const activeKey = ref('course');
                        const apiKey = ref(GM_getValue('czbk_api_key', ''));
                        const apiUrl = ref(GM_getValue('czbk_api_url', config.api.baseUrl) || config.api.baseUrl);
                        const apiStatus = ref(apiKey.value ? '已配置' : '未配置');
                        const autoAnswer = ref(config.features.autoAnswer);
                        const autoSubmit = ref(config.features.autoSubmit);
                        const skipAnswered = ref(config.features.skipAnswered);
                        const useAI = ref(config.features.useAI);
                        const autoUploadToCloud = ref(GM_getValue('czbk_auto_upload', config.features.autoUploadToCloud));
                        const statusText = ref('等待开始');
                        const answerCount = ref(0);
                        const queryResult = ref(null);
                        const queryLoading = ref(false);
                        const logs = ref([]);
                        const correctRate = ref(0);
                        const totalAnswered = ref(0);
                        const answerRecords = ref([]);
                        const logFilter = ref('all'); // all, success, error, warning, info
                        const searchKeyword = ref('');
                        
                        // 面板拖动和最小化相关状态
                        const isMinimized = ref(false);
                        const panelPosition = ref({ x: 10, y: 10 });
                        const isDragging = ref(false);
                        const dragOffset = ref({ x: 0, y: 0 });
                        
                        // 刷课相关状态
                        const instantFinishEnabled = ref(GM_getValue('czbk_instant_finish', false));
                        const playbackSpeed = ref(GM_getValue('czbk_playback_speed', 2.0));
                        const autoNextCourse = ref(GM_getValue('czbk_auto_next_course', true));
                        const isCourseRunning = ref(false);
                        const courseStatus = ref('等待开始');
                        
                        // AI模型配置
                        const aiModel = ref(GM_getValue('czbk_ai_model', config.ai.model));
                        const customModels = ref(JSON.parse(GM_getValue('czbk_custom_models', '[]')));
                        const showCustomModelDialog = ref(false);
                        const customModelForm = ref({
                            id: '',
                            name: '',
                            provider: '',
                            description: '',
                            baseUrl: '',
                            features: ''
                        });
                        
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
                            setInterval(() => {
                                updateStats();
                                updateLogs();
                            }, 1000);
                            
                            // 加载模型列表
                            loadModels();
                            
                            // 添加全局拖动事件监听
                            document.addEventListener('mousemove', handleDragMove);
                            document.addEventListener('mouseup', handleDragEnd);
                            
                            // 恢复面板位置
                            const savedPosition = GM_getValue('czbk_panel_position', null);
                            const savedMinimized = GM_getValue('czbk_panel_minimized', false);
                            
                            if (savedPosition) {
                                // 检查位置是否在屏幕外（可能是之前最小化时保存的位置）
                                if (savedPosition.x >= window.innerWidth - 50) {
                                    // 位置在屏幕外，重置为默认位置
                                    panelPosition.value = { x: window.innerWidth - 540, y: 10 };
                                    isMinimized.value = false;
                                } else {
                                panelPosition.value = savedPosition;
                                    isMinimized.value = savedMinimized;
                                }
                            } else {
                                // 默认位置：屏幕右侧，距离右边10px
                                panelPosition.value = { x: window.innerWidth - 540, y: 10 };
                                isMinimized.value = false;
                            }
                            
                            // 应用位置
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host && panelPosition.value) {
                                host.style.display = 'block'; // 确保面板可见
                                host.style.visibility = 'visible';
                                host.style.opacity = '1';
                                host.style.left = panelPosition.value.x + 'px';
                                host.style.top = panelPosition.value.y + 'px';
                                host.style.right = 'auto';
                                
                                // 确保面板在视口内（检查实际位置，而不是保存的位置）
                                const rect = host.getBoundingClientRect();
                                if (rect.x < 0 || rect.x > window.innerWidth - 100 || rect.y < 0 || rect.y > window.innerHeight - 100) {
                                    // 位置在屏幕外，重置为默认位置（屏幕右侧）
                                    const defaultX = Math.max(10, window.innerWidth - 540);
                                    const defaultY = 10;
                                    panelPosition.value = { x: defaultX, y: defaultY };
                                    host.style.left = defaultX + 'px';
                                    host.style.top = defaultY + 'px';
                                    GM_setValue('czbk_panel_position', panelPosition.value);
                                    utils.log('面板位置在屏幕外，已重置为默认位置:', panelPosition.value);
                                }
                                
                                utils.log('面板位置已应用:', {
                                    x: panelPosition.value.x,
                                    y: panelPosition.value.y,
                                    isMinimized: isMinimized.value,
                                    display: host.style.display,
                                    visibility: host.style.visibility
                                });
                            } else {
                                utils.log('警告: 无法找到面板元素或位置信息无效', { host: !!host, position: panelPosition.value });
                            }
                            
                            // 清理函数
                            return () => {
                                document.removeEventListener('mousemove', handleDragMove);
                                document.removeEventListener('mouseup', handleDragEnd);
                            };
                        });

                        // 更新统计
                        // 记录tab页相关状态
                        const recordSearchKeyword = ref('');
                        const recordFilterType = ref('all'); // all, 0, 1, 2, 3, 4
                        const recordSortBy = ref('time'); // time, question, answer
                        const recordSortOrder = ref('desc'); // asc, desc
                        const recordPageSize = ref(20);
                        const recordCurrentPage = ref(1);
                        
                        // 格式化时间
                        const formatRecordTime = (timestamp) => {
                            if (!timestamp) return '';
                            const date = new Date(timestamp);
                            const now = new Date();
                            const diff = now - date;
                            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                            if (days === 0) {
                                const hours = Math.floor(diff / (1000 * 60 * 60));
                                if (hours === 0) {
                                    const minutes = Math.floor(diff / (1000 * 60));
                                    return minutes <= 0 ? '刚刚' : `${minutes}分钟前`;
                                }
                                return `${hours}小时前`;
                            } else if (days < 7) {
                                return `${days}天前`;
                            } else {
                                return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
                            }
                        };
                        
                        // 分页后的记录
                        const paginatedRecords = computed(() => {
                            const start = (recordCurrentPage.value - 1) * recordPageSize.value;
                            const end = start + recordPageSize.value;
                            return answerRecords.value.slice(start, end);
                        });
                        
                        // 筛选后的记录数量
                        const filteredRecordCount = computed(() => answerRecords.value.length);
                        
                        const updateStats = () => {
                            const stats = answerDBManager.getStats();
                            answerCount.value = stats.total;
                            
                            // 更新答案记录列表
                            const allRecords = [];
                            const db = answerDBManager.getAll();
                            for (const key in db) {
                                const item = db[key];
                                allRecords.push({
                                    id: item.id || item.questionId || key,
                                    question: item.questionContent || item.question || '',
                                    answer: item.answer || '',
                                    questionType: item.questionType || item.type || '0',
                                    solution: item.solution || '',
                                    source: item.source || 'local',
                                    timestamp: item.timestamp || Date.now()
                                });
                            }
                            
                            // 应用搜索
                            let filtered = allRecords;
                            if (recordSearchKeyword.value && recordSearchKeyword.value.trim()) {
                                const keyword = recordSearchKeyword.value.trim().toLowerCase();
                                filtered = filtered.filter(record => {
                                    const question = (record.question || '').toLowerCase();
                                    const answer = (record.answer || '').toLowerCase();
                                    return question.includes(keyword) || answer.includes(keyword);
                                });
                            }
                            
                            // 应用类型筛选
                            if (recordFilterType.value !== 'all') {
                                filtered = filtered.filter(record => record.questionType === recordFilterType.value);
                            }
                            
                            // 应用排序
                            filtered.sort((a, b) => {
                                let compareValue = 0;
                                if (recordSortBy.value === 'time') {
                                    compareValue = (a.timestamp || 0) - (b.timestamp || 0);
                                } else if (recordSortBy.value === 'question') {
                                    compareValue = (a.question || '').localeCompare(b.question || '');
                                } else if (recordSortBy.value === 'answer') {
                                    compareValue = (a.answer || '').localeCompare(b.answer || '');
                                }
                                return recordSortOrder.value === 'asc' ? compareValue : -compareValue;
                            });
                            
                            answerRecords.value = filtered;
                            
                            // 如果当前页超出范围，重置到第一页
                            const maxPage = Math.ceil(filtered.length / recordPageSize.value) || 1;
                            if (recordCurrentPage.value > maxPage) {
                                recordCurrentPage.value = 1;
                            }
                        };
                        
                        // 搜索或筛选改变时重置页码
                        const handleRecordSearchChange = () => {
                            recordCurrentPage.value = 1;
                            updateStats();
                        };

                        // 更新日志
                        const updateLogs = () => {
                            let filteredLogs = answerLogs.slice(0, 100);
                            
                            // 应用过滤器
                            if (logFilter.value !== 'all') {
                                filteredLogs = filteredLogs.filter(log => {
                                    const message = log.message || '';
                                    if (logFilter.value === 'success') {
                                        return message.includes('成功') || message.includes('✅') || message.includes('找到答案');
                                    } else if (logFilter.value === 'error') {
                                        return message.includes('错误') || message.includes('失败') || message.includes('❌');
                                    } else if (logFilter.value === 'warning') {
                                        return message.includes('警告') || message.includes('⚠️');
                                    }
                                    return true;
                                });
                            }
                            
                            // 应用搜索关键词
                            if (searchKeyword.value && searchKeyword.value.trim()) {
                                const keyword = searchKeyword.value.trim().toLowerCase();
                                filteredLogs = filteredLogs.filter(log => {
                                    const message = (log.message || '').toLowerCase();
                                    const time = (log.time || '').toLowerCase();
                                    return message.includes(keyword) || time.includes(keyword);
                                });
                            }
                            
                            logs.value = filteredLogs;
                        };
                        
                        // 获取日志样式类
                        const getLogClass = (message) => {
                            if (!message) return '';
                            const msg = message.toLowerCase();
                            if (msg.includes('成功') || msg.includes('✅') || msg.includes('找到答案')) {
                                return 'czbk-log-success';
                            } else if (msg.includes('错误') || msg.includes('失败') || msg.includes('❌')) {
                                return 'czbk-log-error';
                            } else if (msg.includes('警告') || msg.includes('⚠️')) {
                                return 'czbk-log-warning';
                            }
                            return 'czbk-log-info';
                        };

                        // 保存API配置
                        const saveApiConfig = async () => {
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
                            
                            // 保存配置后自动刷新模型列表
                            await loadModels(true);
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
                                    
                                    // 测试成功后自动刷新模型列表
                                    await loadModels(true);
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

                        // 完成课程（视频页面）
                        const handleFinishCourse = async () => {
                            if (!courseAuto.isVideoPage()) {
                                messageApi.warning('当前不是视频页面');
                                return;
                            }
                            queryLoading.value = true;
                            try {
                                const success = await courseAuto.handleVideoPage();
                                if (success) {
                                    messageApi.success('视频已完成，已自动进入下一个课程');
                                } else {
                                    messageApi.error('完成课程失败');
                                }
                            } catch (e) {
                                messageApi.error('完成课程失败：' + e.message);
                            } finally {
                                queryLoading.value = false;
                            }
                        };

                        // 处理习题页面
                        const handleExercisePage = async () => {
                            if (!courseAuto.isExercisePage()) {
                                messageApi.warning('当前不是习题页面');
                                return;
                            }
                            queryLoading.value = true;
                            try {
                                const success = await courseAuto.handleExercisePage();
                                if (success) {
                                    messageApi.success('习题已提交，已自动进入下一个课程');
                                } else {
                                    messageApi.error('处理习题失败');
                                }
                            } catch (e) {
                                messageApi.error('处理习题失败：' + e.message);
                            } finally {
                                queryLoading.value = false;
                            }
                        };

                        // 一键完成课程（API直接调用）
                        const handleInstantFinish = async () => {
                            if (!courseAuto.isVideoPage()) {
                                messageApi.warning('当前不是视频页面');
                                return;
                            }
                            
                            if (isCourseRunning.value) {
                                messageApi.warning('刷课已在进行中，请先停止');
                                return;
                            }
                            
                            // 风险提示
                            const Modal = antdLib.Modal || antdLib.modal;
                            const executeFinish = async () => {
                                isCourseRunning.value = true;
                                queryLoading.value = true;
                                courseStatus.value = '一键完成中...';
                                try {
                                    const success = await courseAuto.instantFinishCourse();
                                    if (success) {
                                        messageApi.success('一键完成成功！');
                                        courseStatus.value = '已完成';
                                        
                                        // 如果启用自动进入下一课程
                                        if (autoNextCourse.value) {
                                            await utils.sleep(2000);
                                            
                                            // 检查是否进入了习题页面
                                            if (courseAuto.isExercisePage()) {
                                                utils.log('检测到习题页面，开始自动答题...');
                                                courseStatus.value = '处理习题中...';
                                                try {
                                                    const success = await courseAuto.handleExercisePage();
                                                    if (success) {
                                                        courseStatus.value = '习题已完成';
                                                        // 继续下一个课程
                                                        await utils.sleep(2000);
                                                        await courseAuto.handleVideoPage();
                                                    } else {
                                                        courseStatus.value = '习题处理失败';
                                                    }
                                                } catch (e) {
                                                    utils.log('处理习题失败:', e);
                                                    courseStatus.value = '习题处理失败';
                                                }
                                            } else if (courseAuto.isVideoPage()) {
                                                // 如果还是视频页面，检查是否启用一键完成
                                                const instantFinishEnabled = GM_getValue('czbk_instant_finish', false);
                                                if (instantFinishEnabled) {
                                                    // 如果启用一键完成，继续使用一键完成
                                                    await courseAuto.instantFinishCourse();
                                                } else {
                                                    // 否则正常处理视频
                                                    await courseAuto.handleVideoPage();
                                                }
                                            } else {
                                                // 可能是其他页面，尝试继续下一个课程
                                                await utils.sleep(2000);
                                                const nextPoint = courseAuto.getNextPointItem();
                                                if (nextPoint) {
                                                    await courseAuto.clickPointItem(nextPoint, false);
                                                    await utils.sleep(2000);
                                                    if (courseAuto.isVideoPage()) {
                                                        // 检查是否启用一键完成
                                                        const instantFinishEnabled = GM_getValue('czbk_instant_finish', false);
                                                        if (instantFinishEnabled) {
                                                            await courseAuto.instantFinishCourse();
                                                        } else {
                                                            await courseAuto.handleVideoPage();
                                                        }
                                                    } else if (courseAuto.isExercisePage()) {
                                                        await courseAuto.handleExercisePage();
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        messageApi.error('一键完成失败');
                                        courseStatus.value = '失败';
                                    }
                                } catch (e) {
                                    messageApi.error('一键完成失败：' + e.message);
                                    courseStatus.value = '失败';
                                } finally {
                                    isCourseRunning.value = false;
                                    queryLoading.value = false;
                                }
                            };
                            
                            // 使用 ElementPlus 的 MessageBox
                            let ElMessageBox = null;
                            
                            // 尝试多种方式获取 ElMessageBox
                            // ElementPlus 2.x 中，ElMessageBox 通常在 ElementPlus 对象下
                            if (antdLib && antdLib.ElMessageBox) {
                                ElMessageBox = antdLib.ElMessageBox;
                            } else if (antdLib && antdLib.MessageBox) {
                                ElMessageBox = antdLib.MessageBox;
                            } else if (window.ElementPlus) {
                                // ElementPlus 完整版通常将组件挂载在 ElementPlus 对象上
                                ElMessageBox = window.ElementPlus.ElMessageBox || 
                                             window.ElementPlus.MessageBox ||
                                             (window.ElementPlus.default && window.ElementPlus.default.ElMessageBox);
                            } else if (window.ElMessageBox) {
                                ElMessageBox = window.ElMessageBox;
                            }
                            
                            if (ElMessageBox && typeof ElMessageBox.confirm === 'function') {
                                ElMessageBox.confirm(
                                    '一键完成将直接通过API请求修改视频进度为100%，可能被系统检测到异常行为。虽然一般不会影响学业，但请谨慎使用。确定要继续吗？',
                                    '⚠️ 风险提示',
                                    {
                                        confirmButtonText: '确定',
                                        cancelButtonText: '取消',
                                        type: 'warning',
                                        center: true
                                    }
                                )
                                .then(() => {
                                    executeFinish();
                                })
                                .catch(() => {
                                    // 用户取消，不做任何操作
                                });
                            } else {
                                // 降级到原生 confirm
                                if (confirm('⚠️ 风险提示：一键完成将直接通过API请求修改视频进度为100%，可能被系统检测到异常行为。虽然一般不会影响学业，但请谨慎使用。确定要继续吗？')) {
                                    await executeFinish();
                                }
                            }
                        };

                        // 开始刷课
                        const handleStartCourse = async () => {
                            if (isCourseRunning.value) {
                                messageApi.warning('刷课已在进行中');
                                return;
                            }
                            
                            // 检查是否是视频页面
                            if (courseAuto.isVideoPage()) {
                                // 如果启用一键完成，直接调用一键完成（仅视频页面）
                                if (instantFinishEnabled.value) {
                                    // 风险提示已在handleInstantFinish中处理
                                    await handleInstantFinish();
                                    return;
                                }
                                
                                // 正常刷课流程
                                isCourseRunning.value = true;
                                courseStatus.value = '刷课中...';
                                queryLoading.value = true;
                                
                                try {
                                    const video = document.querySelector('video');
                                    if (video) {
                                        // 设置播放速度
                                        video.playbackRate = playbackSpeed.value;
                                        utils.log(`视频播放速度设置为 ${playbackSpeed.value}x`);
                                        
                                        // 正常刷课流程
                                        const success = await courseAuto.handleVideoPage();
                                        if (success) {
                                            courseStatus.value = '已完成';
                                            if (autoNextCourse.value) {
                                                await utils.sleep(2000);
                                                // 继续下一个课程
                                                await courseAuto.handleVideoPage();
                                            }
                                        } else {
                                            courseStatus.value = '失败';
                                        }
                                    } else {
                                        messageApi.warning('未找到视频元素');
                                        courseStatus.value = '失败';
                                    }
                                } catch (e) {
                                    messageApi.error('刷课失败：' + e.message);
                                    courseStatus.value = '失败';
                                } finally {
                                    isCourseRunning.value = false;
                                    queryLoading.value = false;
                                }
                            } else if (courseAuto.isExercisePage()) {
                                // 习题页面，自动答题并提交
                                isCourseRunning.value = true;
                                courseStatus.value = '处理习题中...';
                                queryLoading.value = true;
                                
                                try {
                                    // 强制启用自动答题
                                    const originalAutoAnswer = config.features.autoAnswer;
                                    config.features.autoAnswer = true;
                                    
                                    const success = await courseAuto.handleExercisePage();
                                    if (success) {
                                        courseStatus.value = '习题已完成';
                                        
                                        // 如果启用自动进入下一课程，继续
                                        if (autoNextCourse.value) {
                                            await utils.sleep(2000);
                                            // 检查当前页面类型，继续处理
                                            if (courseAuto.isVideoPage()) {
                                                // 进入视频页面，继续刷课
                                                await handleStartCourse();
                                            } else if (courseAuto.isExercisePage()) {
                                                // 如果还是习题页面，继续处理
                                                await handleStartCourse();
                                            } else {
                                                // 其他情况，尝试查找下一个课程点
                                                const nextPoint = courseAuto.getNextPointItem();
                                                if (nextPoint) {
                                                    await courseAuto.clickPointItem(nextPoint, false);
                                                    await utils.sleep(2000);
                                                    await handleStartCourse();
                                                }
                                            }
                                        }
                                    } else {
                                        courseStatus.value = '习题处理失败';
                                    }
                                    
                                    // 恢复原始设置
                                    config.features.autoAnswer = originalAutoAnswer;
                                } catch (e) {
                                    messageApi.error('处理习题失败：' + e.message);
                                    courseStatus.value = '失败';
                                    utils.log('处理习题失败:', e);
                                } finally {
                                    isCourseRunning.value = false;
                                    queryLoading.value = false;
                                }
                            } else {
                                messageApi.warning('当前不是视频或习题页面');
                            }
                        };

                        // 停止刷课
                        const handleStopCourse = () => {
                            if (!isCourseRunning.value) {
                                messageApi.warning('刷课未在进行中');
                                return;
                            }
                            isCourseRunning.value = false;
                            courseStatus.value = '已停止';
                            messageApi.info('已停止刷课');
                        };

                        // 刷课设置变化处理
                        const handleInstantFinishChange = (value) => {
                            instantFinishEnabled.value = value;
                            GM_setValue('czbk_instant_finish', value);
                            utils.log(`一键完成已${value ? '开启' : '关闭'}`);
                        };

                        const handlePlaybackSpeedChange = (value) => {
                            playbackSpeed.value = value;
                            GM_setValue('czbk_playback_speed', value);
                            utils.log(`播放速度已设置为 ${value}x`);
                        };

                        const handleAutoNextCourseChange = (value) => {
                            autoNextCourse.value = value;
                            GM_setValue('czbk_auto_next_course', value);
                            utils.log(`自动进入下一课程已${value ? '开启' : '关闭'}`);
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
                        const handleClearAnswer = async () => {
                            // 使用 ElementPlus 的 MessageBox
                            let ElMessageBox = null;
                            
                            // 尝试多种方式获取 ElMessageBox
                            if (antdLib && antdLib.ElMessageBox) {
                                ElMessageBox = antdLib.ElMessageBox;
                            } else if (antdLib && antdLib.MessageBox) {
                                ElMessageBox = antdLib.MessageBox;
                            } else if (window.ElementPlus) {
                                ElMessageBox = window.ElementPlus.ElMessageBox || 
                                             window.ElementPlus.MessageBox ||
                                             (window.ElementPlus.default && window.ElementPlus.default.ElMessageBox);
                            } else if (window.ElMessageBox) {
                                ElMessageBox = window.ElMessageBox;
                            }
                            
                            if (ElMessageBox && typeof ElMessageBox.confirm === 'function') {
                                try {
                                    await ElMessageBox.confirm(
                                        '确定要清空所有答案吗？此操作不可恢复！',
                                        '⚠️ 确认清空',
                                        {
                                            confirmButtonText: '确定清空',
                                            cancelButtonText: '取消',
                                            type: 'warning',
                                            center: true
                                        }
                                    );
                                    answerDBManager.clear();
                                    updateStats();
                                    messageApi.success('答案库已清空');
                                } catch {
                                    // 用户取消，不做任何操作
                                }
                            } else {
                                if (confirm('确定要清空所有答案吗？')) {
                                    answerDBManager.clear();
                                    updateStats();
                                    messageApi.success('答案库已清空');
                                }
                            }
                        };

                        // 开始答题
                        const handleStartAnswer = async () => {
                            // 使用全局的 autoAnswer 对象，不是 ref
                            if (window.autoAnswer && window.autoAnswer.isRunning) {
                                messageApi.warning('答题已在进行中');
                                return;
                            }
                            statusText.value = '正在答题...';
                            try {
                                if (window.autoAnswer && typeof window.autoAnswer.start === 'function') {
                                    await window.autoAnswer.start();
                                    messageApi.success('已开始自动答题');
                                } else {
                                    messageApi.error('autoAnswer 对象未初始化');
                                    utils.log('启动答题失败: autoAnswer 对象未找到');
                                }
                            } catch (e) {
                                utils.log('启动答题失败:', e);
                                messageApi.error('启动答题失败: ' + (e.message || e));
                                statusText.value = '启动失败';
                            }
                        };

                        // 停止答题
                        const handleStopAnswer = () => {
                            // 使用全局的 autoAnswer 对象，不是 ref
                            if (window.autoAnswer && !window.autoAnswer.isRunning) {
                                messageApi.warning('答题未在进行中');
                                return;
                            }
                            try {
                                if (window.autoAnswer && typeof window.autoAnswer.stop === 'function') {
                                    window.autoAnswer.stop();
                                    statusText.value = '已停止';
                                    messageApi.info('已停止自动答题');
                                } else {
                                    messageApi.error('autoAnswer 对象未初始化');
                                    utils.log('停止答题失败: autoAnswer 对象未找到');
                                }
                            } catch (e) {
                                utils.log('停止答题失败:', e);
                                messageApi.error('停止答题失败: ' + (e.message || e));
                            }
                        };

                        // 复制日志
                        const handleCopyLogs = async () => {
                            const logText = logs.value.map(log => `[${log.time}] ${log.message}`).join('\n');
                            
                            if (!logText.trim()) {
                                messageApi.warning('暂无日志可复制');
                                return;
                            }
                            
                            // 方法1: 使用现代 Clipboard API
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                try {
                                    await navigator.clipboard.writeText(logText);
                                    messageApi.success('日志已复制到剪贴板');
                                    return;
                                } catch (e) {
                                    console.warn('Clipboard API失败，尝试fallback方法:', e);
                                }
                            }
                            
                            // 方法2: 使用传统方法（fallback）
                            try {
                                const textArea = document.createElement('textarea');
                                textArea.value = logText;
                                textArea.style.position = 'fixed';
                                textArea.style.left = '-999999px';
                                textArea.style.top = '-999999px';
                                document.body.appendChild(textArea);
                                textArea.focus();
                                textArea.select();
                                
                                const successful = document.execCommand('copy');
                                document.body.removeChild(textArea);
                                
                                if (successful) {
                                    messageApi.success('日志已复制到剪贴板');
                                } else {
                                    throw new Error('execCommand失败');
                                }
                            } catch (e) {
                                // 方法3: 如果都失败，显示日志让用户手动复制
                                const logWindow = window.open('', '_blank');
                                if (logWindow) {
                                    logWindow.document.write(`
                                        <html>
                                            <head><title>答题日志</title></head>
                                            <body style="font-family: monospace; padding: 20px; white-space: pre-wrap;">${logText}</body>
                                        </html>
                                    `);
                                    messageApi.info('日志已在新窗口打开，请手动复制');
                                } else {
                                    messageApi.error('复制失败，请手动选择日志文本复制');
                                }
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

                        // 最小化面板
                        const handleMinimizePanel = () => {
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host) {
                                const rect = host.getBoundingClientRect();
                                panelPosition.value = { x: window.innerWidth, y: rect.top + rect.height / 2 };
                                GM_setValue('czbk_panel_position', panelPosition.value);
                                GM_setValue('czbk_panel_minimized', true);
                            }
                            isMinimized.value = true;
                        };

                        // 恢复面板
                        const handleRestorePanel = () => {
                            isMinimized.value = false;
                            GM_setValue('czbk_panel_minimized', false);
                            // 恢复位置
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host && panelPosition.value) {
                                // 如果位置在右边（最小化状态），恢复到默认位置
                                if (panelPosition.value.x === window.innerWidth || panelPosition.value.x >= window.innerWidth - 50) {
                                    panelPosition.value = { x: window.innerWidth - 540, y: 10 };
                                    GM_setValue('czbk_panel_position', panelPosition.value);
                                }
                                host.style.display = 'block'; // 确保面板可见
                                host.style.visibility = 'visible';
                                host.style.left = panelPosition.value.x + 'px';
                                host.style.top = panelPosition.value.y + 'px';
                                host.style.right = 'auto';
                            }
                        };

                        // 拖动开始
                        const handleDragStart = (e) => {
                            if (isMinimized.value) return;
                            isDragging.value = true;
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host) {
                                const rect = host.getBoundingClientRect();
                                dragOffset.value = {
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                };
                            }
                            e.preventDefault();
                        };

                        // 拖动中
                        const handleDragMove = (e) => {
                            if (!isDragging.value || isMinimized.value) return;
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host) {
                                const newX = e.clientX - dragOffset.value.x;
                                const newY = e.clientY - dragOffset.value.y;
                                
                                // 限制在视口内
                                const maxX = window.innerWidth - host.offsetWidth;
                                const maxY = window.innerHeight - host.offsetHeight;
                                
                                panelPosition.value = {
                                    x: Math.max(0, Math.min(newX, maxX)),
                                    y: Math.max(0, Math.min(newY, maxY))
                                };
                                
                                host.style.left = panelPosition.value.x + 'px';
                                host.style.top = panelPosition.value.y + 'px';
                                host.style.right = 'auto';
                                
                                // 保存位置
                                GM_setValue('czbk_panel_position', panelPosition.value);
                            }
                        };

                        // 拖动结束
                        const handleDragEnd = () => {
                            isDragging.value = false;
                        };

                        // 初始化拖动事件监听
                        onMounted(() => {
                            updateStats();
                            updateLogs();
                            setInterval(() => {
                                updateStats();
                                updateLogs();
                            }, 1000);
                            
                            // 添加全局拖动事件监听
                            document.addEventListener('mousemove', handleDragMove);
                            document.addEventListener('mouseup', handleDragEnd);
                            
                            // 恢复面板位置
                            const savedPosition = GM_getValue('czbk_panel_position', null);
                            if (savedPosition) {
                                panelPosition.value = savedPosition;
                            }
                            
                            // 应用位置
                            const host = document.getElementById('czbk-vue-panel-host');
                            if (host && panelPosition.value) {
                                host.style.left = panelPosition.value.x + 'px';
                                host.style.top = panelPosition.value.y + 'px';
                                host.style.right = 'auto';
                            }
                        });

                        // 自动答题开关变化处理
                        const handleAutoAnswerChange = (value) => {
                            config.features.autoAnswer = value;
                            GM_setValue('czbk_auto_answer', value);
                            utils.log(`自动答题已${value ? '开启' : '关闭'}`);
                        };

                        // 自动提交开关变化处理
                        const handleAutoSubmitChange = (value) => {
                            config.features.autoSubmit = value;
                            GM_setValue('czbk_auto_submit', value);
                            utils.log(`自动提交已${value ? '开启' : '关闭'}`);
                        };

                        // 跳过已答开关变化处理
                        const handleSkipAnsweredChange = (value) => {
                            config.features.skipAnswered = value;
                            GM_setValue('czbk_skip_answered', value);
                            utils.log(`跳过已答已${value ? '开启' : '关闭'}`);
                        };

                        // AI答题开关变化处理
                        const handleUseAIChange = (value) => {
                            config.features.useAI = value;
                            GM_setValue('czbk_use_ai', value);
                            utils.log(`AI答题已${value ? '开启' : '关闭'}`);
                        };
                        
                        // 自动上传云端开关变化处理
                        const handleAutoUploadChange = (value) => {
                            config.features.autoUploadToCloud = value;
                            GM_setValue('czbk_auto_upload', value);
                            utils.log(`自动上传云端已${value ? '开启' : '关闭'}`);
                        };

                        // 预设模型列表（从后端加载）
                        const presetModels = ref([]);
                        const modelsLoading = ref(false);
                        
                        // 从后端加载模型列表
                        const loadModels = async (showMessage = false) => {
                            modelsLoading.value = true;
                            try {
                                const backendModels = await apiQuery.getModels();
                                
                                if (backendModels && backendModels.length > 0) {
                                    // 合并后端模型和默认预设模型（去重，后端模型优先）
                                    const defaultModels = config.ai.presetModels || [];
                                    const modelMap = new Map();
                                    
                                    // 先添加默认模型
                                    defaultModels.forEach(model => {
                                        modelMap.set(model.id, { ...model, source: 'default' });
                                    });
                                    
                                    // 后端模型覆盖默认模型（如果ID相同）
                                    backendModels.forEach(model => {
                                        modelMap.set(model.id, { ...model, source: 'backend' });
                                    });
                                    
                                    presetModels.value = Array.from(modelMap.values());
                                    
                                    const backendCount = backendModels.length;
                                    const totalCount = presetModels.value.length;
                                    const defaultCount = totalCount - backendCount;
                                    utils.log(`模型列表加载成功：后端${backendCount}个，默认${defaultCount}个，总计${totalCount}个`);
                                    
                                    if (showMessage) {
                                        if (backendCount > 0) {
                                            messageApi.success(`已加载${totalCount}个模型（后端${backendCount}个，默认${defaultCount}个）`);
                                        } else {
                                            messageApi.info(`使用默认模型列表（${totalCount}个）`);
                                        }
                                    }
                                } else {
                                    // 如果后端返回空列表，使用默认预设模型
                                    presetModels.value = config.ai.presetModels || [];
                                    utils.log('后端未返回模型，使用默认预设模型');
                                    
                                    if (showMessage) {
                                        messageApi.info('使用默认预设模型');
                                    }
                                }
                            } catch (e) {
                                utils.log('从后端加载模型列表失败，使用默认预设模型:', e);
                                // 加载失败时使用默认预设模型
                                presetModels.value = config.ai.presetModels || [];
                                
                                if (showMessage) {
                                    messageApi.warning('后端模型加载失败，使用默认模型');
                                }
                            } finally {
                                modelsLoading.value = false;
                            }
                        };
                        
                        // 刷新模型列表
                        const refreshModels = () => {
                            loadModels(true);
                        };
                        
                        // 当前模型信息
                        const currentModelInfo = computed(() => {
                            const allModels = [...presetModels.value, ...customModels.value];
                            return allModels.find(m => m.id === aiModel.value) || null;
                        });
                        
                        // 模型变化处理
                        const handleModelChange = (modelId) => {
                            config.ai.model = modelId;
                            GM_setValue('czbk_ai_model', modelId);
                            utils.log(`AI模型已切换为: ${modelId}`);
                            messageApi.success('模型已切换');
                        };
                        
                        // 保存自定义模型
                        const handleSaveCustomModel = () => {
                            if (!customModelForm.value.id || !customModelForm.value.name) {
                                messageApi.warning('请填写模型ID和名称');
                                return;
                            }
                            
                            const newModel = {
                                id: customModelForm.value.id,
                                name: customModelForm.value.name,
                                provider: customModelForm.value.provider || 'Custom',
                                description: customModelForm.value.description || '自定义模型',
                                baseUrl: customModelForm.value.baseUrl || '',
                                features: customModelForm.value.features ? customModelForm.value.features.split(',').map(f => f.trim()) : []
                            };
                            
                            // 检查是否已存在
                            const exists = customModels.value.find(m => m.id === newModel.id);
                            if (exists) {
                                messageApi.warning('该模型ID已存在');
                                return;
                            }
                            
                            customModels.value.push(newModel);
                            GM_setValue('czbk_custom_models', JSON.stringify(customModels.value));
                            messageApi.success('自定义模型已添加');
                            
                            // 重置表单
                            customModelForm.value = {
                                id: '',
                                name: '',
                                provider: '',
                                description: '',
                                baseUrl: '',
                                features: ''
                            };
                            showCustomModelDialog.value = false;
                        };
                        
                        // 删除自定义模型
                        const handleDeleteCustomModel = (modelId) => {
                            const index = customModels.value.findIndex(m => m.id === modelId);
                            if (index > -1) {
                                customModels.value.splice(index, 1);
                                GM_setValue('czbk_custom_models', JSON.stringify(customModels.value));
                                messageApi.success('自定义模型已删除');
                                
                                // 如果删除的是当前使用的模型，切换回默认模型
                                if (aiModel.value === modelId) {
                                    handleModelChange(config.ai.presetModels[0].id);
                                }
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
                            autoUploadToCloudValue: autoUploadToCloud,
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
                            handleExercisePage,
                            handleImportAnswer,
                            handleExportAnswer,
                            handleClearAnswer,
                            handleStartAnswer,
                            handleStopAnswer,
                            handleCopyLogs,
                            handleClearLogs,
                            handleClosePanel,
                            handleMinimizePanel,
                            handleRestorePanel,
                            handleDragStart,
                            isMinimized,
                            panelPosition,
                            handleAutoAnswerChange,
                            handleAutoSubmitChange,
                            handleSkipAnsweredChange,
                            handleUseAIChange,
                            handleAutoUploadChange,
                            updateStats,
                            updateLogs,
                            getLogClass,
                            correctRate,
                            totalAnswered,
                            answerRecords,
                            logFilter,
                            searchKeyword,
                            recordSearchKeyword,
                            recordFilterType,
                            recordSortBy,
                            recordSortOrder,
                            recordPageSize,
                            recordCurrentPage,
                            paginatedRecords,
                            filteredRecordCount,
                            formatRecordTime,
                            handleRecordSearchChange,
                            isVideoPage: computed(() => {
                                try {
                                    return courseAuto && typeof courseAuto.isVideoPage === 'function' ? courseAuto.isVideoPage() : false;
                                } catch (e) {
                                    return false;
                                }
                            }),
                            isExercisePage: computed(() => {
                                try {
                                    return courseAuto && typeof courseAuto.isExercisePage === 'function' ? courseAuto.isExercisePage() : false;
                                } catch (e) {
                                    return false;
                                }
                            }),
                            // AI模型相关
                            aiModel,
                            presetModels,
                            modelsLoading,
                            loadModels,
                            refreshModels,
                            currentModelInfo,
                            customModels,
                            showCustomModelDialog,
                            customModelForm,
                            handleModelChange,
                            handleSaveCustomModel,
                            handleDeleteCustomModel,
                            // 刷课相关
                            instantFinishEnabled,
                            playbackSpeed,
                            autoNextCourse,
                            isCourseRunning,
                            courseStatus,
                            handleInstantFinish,
                            handleStartCourse,
                            handleStopCourse,
                            handleInstantFinishChange,
                            handlePlaybackSpeedChange,
                            handleAutoNextCourseChange
                        };
                    },
                    template: `
                        <!-- 最小化后的恢复按钮 -->
                        <div v-if="isMinimized" 
                             @click="handleRestorePanel"
                             style="position: fixed; right: 0; z-index: 99999; background: #ffffff; color: #303133; padding: 24px 3px; border-radius: 8px 0 0 8px; cursor: pointer; box-shadow: -2px 0 8px rgba(0,0,0,0.1); border: 1px solid #e4e7ed; border-right: none; writing-mode: vertical-lr; text-orientation: upright; font-size: 16px; font-weight: 600; user-select: none; transition: all 0.3s ease; width: 28px;"
                             :style="{ top: (panelPosition.y || window.innerHeight / 2) + 'px', transform: 'translateY(-50%)' }"
                             @mouseenter="$event.target.style.paddingRight = '6px'; $event.target.style.boxShadow = '-4px 0 12px rgba(0,0,0,0.15)'"
                             @mouseleave="$event.target.style.paddingRight = '3px'; $event.target.style.boxShadow = '-2px 0 8px rgba(0,0,0,0.1)'"
                        >
                            &gt;
                        </div>
                        
                        <!-- 主面板 -->
                        <el-card 
                            v-if="!isMinimized"
                            class="czbk-panel-card"
                            :bordered="false" 
                            style="width: 520px; max-height: 850px;"
                        >
                            <template #header>
                                <div 
                                    @mousedown="handleDragStart"
                                    style="display: flex; justify-content: space-between; align-items: center; width: 100%; cursor: move; user-select: none;"
                                >
                                    <span style="color: #303133; font-weight: 600; font-size: 15px;">🐑 懒羊羊自动化平台</span>
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <el-button type="text" @click="handleMinimizePanel" style="color: #606266; font-size: 18px; padding: 0; width: 24px; height: 24px; line-height: 1;">−</el-button>
                                        <el-button type="text" @click="handleClosePanel" style="color: #606266; font-size: 20px; padding: 0; width: 24px; height: 24px; line-height: 1;">×</el-button>
                                    </div>
                                </div>
                            </template>
                            
                            <el-tabs v-model="activeKey" size="small">
                                <!-- 刷课 Tab -->
                                <el-tab-pane label="刷课" name="course">
                                    <div style="display: flex; flex-direction: column; height: 100%; max-height: 700px;">
                                        <!-- 上半部分：功能区域 -->
                                        <div style="flex: 1; overflow-y: auto; padding-right: 4px;">
                                            <el-space direction="vertical" style="width: 100%;" :size="12">
                                                <!-- 刷课状态 -->
                                                <div class="czbk-stat-item">
                                                    <span class="czbk-stat-label">🎬 刷课状态</span>
                                                    <span class="czbk-stat-value" :style="{ color: courseStatus === '刷课中...' ? '#67c23a' : courseStatus === '已完成' ? '#409eff' : '#909399' }">{{ courseStatus }}</span>
                                                </div>
                                                
                                                <el-divider style="margin: 8px 0;" />
                                                
                                                <!-- 刷课功能区域 -->
                                                <div style="background: #f5f7fa; padding: 12px; border-radius: 6px;">
                                                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #303133;">🎬 刷课设置</div>
                                                    
                                                    <!-- 播放速度选择 -->
                                                    <div style="margin-bottom: 10px;">
                                                        <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #606266;">播放速度</label>
                                                        <el-select v-model="playbackSpeed" @change="handlePlaybackSpeedChange" size="small" style="width: 100%;" popper-class="czbk-select-dropdown">
                                                            <el-option label="1.0x (正常)" :value="1.0" />
                                                            <el-option label="1.5x" :value="1.5" />
                                                            <el-option label="2.0x (推荐)" :value="2.0" />
                                                            <el-option label="2.5x" :value="2.5" />
                                                        </el-select>
                                                    </div>
                                                    
                                                    <!-- 一键完成开关（带风险提示） -->
                                                    <div style="margin-bottom: 10px; padding: 8px; background: #fff3cd; border-radius: 4px; border-left: 3px solid #ffc107;">
                                                        <el-checkbox v-model="instantFinishEnabled" @change="handleInstantFinishChange" style="margin: 0;">
                                                            <span style="font-weight: 600; color: #856404;">⚠️ 一键完成</span>
                                                        </el-checkbox>
                                                        <div style="font-size: 11px; color: #856404; margin-top: 4px; line-height: 1.4;">
                                                            直接快进到视频结尾并调用API更新进度，可能被系统检测到异常行为。虽然一般不会影响学业，但请谨慎使用。
                                                        </div>
                                                    </div>
                                                    
                                                    <!-- 自动进入下一课程 -->
                                                    <div style="margin-bottom: 10px;">
                                                        <el-checkbox v-model="autoNextCourse" @change="handleAutoNextCourseChange" style="margin: 0;">
                                                            ⏭️ 自动进入下一课程
                                                        </el-checkbox>
                                                    </div>
                                                    
                                                    <!-- 刷课操作按钮 -->
                                                    <div style="display: flex; gap: 8px; width: 100%;">
                                                        <el-button 
                                                            v-if="isVideoPage || isExercisePage" 
                                                            type="primary" 
                                                            :loading="queryLoading" 
                                                            @click="handleStartCourse" 
                                                            :disabled="isCourseRunning"
                                                            style="flex: 1; margin: 0;"
                                                        >
                                                            {{ isCourseRunning ? '刷课中...' : '🚀 开始刷课' }}
                                                        </el-button>
                                                        <el-button 
                                                            v-if="isCourseRunning" 
                                                            type="danger" 
                                                            @click="handleStopCourse" 
                                                            style="flex: 1; margin: 0;"
                                                        >
                                                            ⏹️ 停止刷课
                                                        </el-button>
                                                        <el-button 
                                                            v-if="isVideoPage && instantFinishEnabled" 
                                                            type="warning" 
                                                            :loading="queryLoading" 
                                                            @click="handleInstantFinish" 
                                                            style="flex: 1; margin: 0;"
                                                        >
                                                            ⚡ 一键完成
                                                        </el-button>
                                                    </div>
                                                </div>
                                                
                                                <el-divider style="margin: 8px 0;" />
                                                
                                                <!-- API状态 -->
                                                <div class="czbk-stat-item">
                                                    <span class="czbk-stat-label">🔑 API状态</span>
                                                    <span class="czbk-stat-value" :style="{ color: apiStatus === '已配置' || apiStatus === '连接成功' ? '#67c23a' : '#e6a23c' }">{{ apiStatus }}</span>
                                                </div>
                                            </el-space>
                                        </div>
                                        
                                        <!-- 下半部分：日志区域（全宽，固定在底部） -->
                                        <div style="border-top: 2px solid #e4e7ed; margin-top: 12px; padding-top: 12px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                                <div style="font-size: 13px; font-weight: 600; color: #303133;">📝 操作日志</div>
                                                <div style="display: flex; gap: 6px;">
                                                    <el-button size="small" type="primary" @click="handleCopyLogs" style="margin: 0; padding: 4px 12px;">📋 复制日志</el-button>
                                                    <el-button size="small" @click="handleClearLogs" style="margin: 0; padding: 4px 12px;">🗑️ 清空</el-button>
                                                </div>
                                            </div>
                                            
                                            <!-- 日志搜索和过滤 -->
                                            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                                                <el-input 
                                                    v-model="searchKeyword" 
                                                    placeholder="搜索日志..." 
                                                    size="small" 
                                                    clearable
                                                    @input="updateLogs"
                                                    style="flex: 1;"
                                                >
                                                    <template #prefix>🔍</template>
                                                </el-input>
                                                <el-radio-group v-model="logFilter" size="small" @change="updateLogs">
                                                    <el-radio-button label="all">全部</el-radio-button>
                                                    <el-radio-button label="success">成功</el-radio-button>
                                                    <el-radio-button label="error">错误</el-radio-button>
                                                    <el-radio-button label="warning">警告</el-radio-button>
                                                </el-radio-group>
                                            </div>
                                            
                                            <!-- 日志内容区域（更大，更明显） -->
                                            <div style="height: 200px; overflow-y: auto; background: #f5f7fa; padding: 12px; border-radius: 6px; border: 1px solid #e4e7ed;">
                                                <div v-if="logs.length === 0" style="color: #909399; text-align: center; padding: 40px 20px; font-size: 13px;">暂无日志</div>
                                                <div v-for="(log, index) in logs" :key="index" :class="['czbk-log-item', getLogClass(log.message)]" style="padding: 6px 0; font-size: 12px; line-height: 1.6; border-bottom: 1px solid #ebeef5;">
                                                    <span class="czbk-log-time" style="color: #909399; margin-right: 8px;">[{{ log.time }}]</span>
                                                    <span style="word-break: break-word;">{{ log.message }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </el-tab-pane>
                                
                                <!-- 答题 Tab -->
                                <el-tab-pane label="答题" name="answer">
                                    <div style="display: flex; flex-direction: column; height: 100%; max-height: 700px;">
                                        <!-- 上半部分：功能区域 -->
                                        <div style="flex: 1; overflow-y: auto; padding-right: 4px;">
                                            <el-space direction="vertical" style="width: 100%;" :size="12">
                                                <!-- 统计信息 -->
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                    <div class="czbk-stat-item">
                                                        <span class="czbk-stat-label">📊 答题状态</span>
                                                        <span class="czbk-stat-value" :style="{ color: statusText === '正在答题...' ? '#67c23a' : '#909399' }">{{ statusText }}</span>
                                                    </div>
                                                    <div class="czbk-stat-item">
                                                        <span class="czbk-stat-label">📚 答案库</span>
                                                        <span class="czbk-stat-value">{{ answerCount }} 道</span>
                                                    </div>
                                                    <div v-if="totalAnswered > 0" class="czbk-stat-item">
                                                        <span class="czbk-stat-label">✅ 正确率</span>
                                                        <span class="czbk-stat-value" :style="{ color: correctRate >= 80 ? '#67c23a' : correctRate >= 60 ? '#e6a23c' : '#f56c6c' }">{{ correctRate }}%</span>
                                                    </div>
                                                </div>
                                                <div v-if="totalAnswered > 0" class="czbk-progress-bar">
                                                    <div class="czbk-progress-fill" :style="{ width: correctRate + '%' }"></div>
                                                </div>
                                                
                                                <el-divider style="margin: 8px 0;" />
                                                
                                                <!-- 答题功能区域 -->
                                                <div style="background: #f5f7fa; padding: 12px; border-radius: 6px;">
                                                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #303133;">📝 答题设置</div>
                                                    
                                                    <!-- 功能开关 -->
                                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                                                        <el-checkbox v-model="autoAnswerValue" @change="handleAutoAnswerChange" style="margin: 0;">✅ 自动答题</el-checkbox>
                                                        <el-checkbox v-model="autoSubmitValue" @change="handleAutoSubmitChange" style="margin: 0;">📤 自动提交</el-checkbox>
                                                        <el-checkbox v-model="skipAnsweredValue" @change="handleSkipAnsweredChange" style="margin: 0;">⏭️ 跳过已答</el-checkbox>
                                                        <el-checkbox v-model="useAIValue" @change="handleUseAIChange" style="margin: 0;">🤖 AI答题</el-checkbox>
                                                        <el-checkbox v-model="autoUploadToCloudValue" @change="handleAutoUploadChange" style="margin: 0; grid-column: 1 / -1;">☁️ 自动上传云端</el-checkbox>
                                                    </div>
                                                    
                                                    <!-- 答题操作按钮 -->
                                                    <div style="display: flex; gap: 8px; width: 100%;">
                                                        <el-button type="primary" @click="handleStartAnswer" style="flex: 1; margin: 0;">🚀 开始答题</el-button>
                                                        <el-button type="danger" @click="handleStopAnswer" style="flex: 1; margin: 0;">⏹️ 停止答题</el-button>
                                                    </div>
                                                </div>
                                                
                                                <el-divider style="margin: 8px 0;" />
                                                
                                                <!-- API状态 -->
                                                <div class="czbk-stat-item">
                                                    <span class="czbk-stat-label">🔑 API状态</span>
                                                    <span class="czbk-stat-value" :style="{ color: apiStatus === '已配置' || apiStatus === '连接成功' ? '#67c23a' : '#e6a23c' }">{{ apiStatus }}</span>
                                                </div>
                                            </el-space>
                                        </div>
                                        
                                        <!-- 下半部分：日志区域（全宽，固定在底部） -->
                                        <div style="border-top: 2px solid #e4e7ed; margin-top: 12px; padding-top: 12px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                                <div style="font-size: 13px; font-weight: 600; color: #303133;">📝 操作日志</div>
                                                <div style="display: flex; gap: 6px;">
                                                    <el-button size="small" type="primary" @click="handleCopyLogs" style="margin: 0; padding: 4px 12px;">📋 复制日志</el-button>
                                                    <el-button size="small" @click="handleClearLogs" style="margin: 0; padding: 4px 12px;">🗑️ 清空</el-button>
                                                </div>
                                            </div>
                                            
                                            <!-- 日志搜索和过滤 -->
                                            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                                                <el-input 
                                                    v-model="searchKeyword" 
                                                    placeholder="搜索日志..." 
                                                    size="small" 
                                                    clearable
                                                    @input="updateLogs"
                                                    style="flex: 1;"
                                                >
                                                    <template #prefix>🔍</template>
                                                </el-input>
                                                <el-radio-group v-model="logFilter" size="small" @change="updateLogs">
                                                    <el-radio-button label="all">全部</el-radio-button>
                                                    <el-radio-button label="success">成功</el-radio-button>
                                                    <el-radio-button label="error">错误</el-radio-button>
                                                    <el-radio-button label="warning">警告</el-radio-button>
                                                </el-radio-group>
                                            </div>
                                            
                                            <!-- 日志内容区域（更大，更明显） -->
                                            <div style="height: 200px; overflow-y: auto; background: #f5f7fa; padding: 12px; border-radius: 6px; border: 1px solid #e4e7ed;">
                                                <div v-if="logs.length === 0" style="color: #909399; text-align: center; padding: 40px 20px; font-size: 13px;">暂无日志</div>
                                                <div v-for="(log, index) in logs" :key="index" :class="['czbk-log-item', getLogClass(log.message)]" style="padding: 6px 0; font-size: 12px; line-height: 1.6; border-bottom: 1px solid #ebeef5;">
                                                    <span class="czbk-log-time" style="color: #909399; margin-right: 8px;">[{{ log.time }}]</span>
                                                    <span style="word-break: break-word;">{{ log.message }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </el-tab-pane>
                                
                                <!-- 配置 Tab -->
                                <el-tab-pane label="配置" name="config">
                                    <el-space direction="vertical" style="width: 100%;" :size="16">
                                        <!-- API配置区域 -->
                                        <div style="background: #f5f7fa; padding: 16px; border-radius: 8px;">
                                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #303133;">🔑 API配置</div>
                                            
                                            <div style="margin-bottom: 12px;">
                                                <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #606266;">API Key</label>
                                                <el-input 
                                                    v-model="apiKeyValue" 
                                                    type="password" 
                                                    placeholder="请输入API Key" 
                                                    show-password 
                                                    size="default"
                                                    style="width: 100%;"
                                                />
                                            </div>
                                            
                                            <div style="margin-bottom: 12px;">
                                                <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #606266;">API地址</label>
                                                <el-input 
                                                    v-model="apiUrlValue" 
                                                    placeholder="http://localhost:8000" 
                                                    size="default"
                                                    style="width: 100%;"
                                                />
                                            </div>
                                            
                                            <el-space style="width: 100%;" :size="8" :wrap="false">
                                                <el-button type="primary" @click="saveApiConfig" style="flex: 1; min-width: 0;">💾 保存</el-button>
                                                <el-button @click="testApiConnection" style="flex: 1; min-width: 0;">🔌 测试</el-button>
                                            </el-space>
                                            
                                            <div class="czbk-stat-item" style="margin-top: 12px; margin-bottom: 0;">
                                                <span class="czbk-stat-label">状态</span>
                                                <span class="czbk-stat-value" :style="{ color: apiStatus === '已配置' || apiStatus === '连接成功' ? '#67c23a' : apiStatus === '测试中...' ? '#409eff' : '#e6a23c' }">{{ apiStatus }}</span>
                                            </div>
                                        </div>
                                        
                                        <el-divider style="margin: 8px 0;" />
                                        
                                        <!-- AI模型配置 -->
                                        <div style="background: #f5f7fa; padding: 16px; border-radius: 8px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                                <div style="font-size: 14px; font-weight: 600; color: #303133;">🤖 AI模型配置</div>
                                                <el-button 
                                                    type="text" 
                                                    size="small" 
                                                    @click="refreshModels" 
                                                    :loading="modelsLoading"
                                                    style="padding: 0 8px;"
                                                >
                                                    🔄 刷新
                                                </el-button>
                                            </div>
                                            
                                            <div style="margin-bottom: 12px;">
                                                <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #606266;">选择模型</label>
                                                <el-select 
                                                    v-model="aiModel" 
                                                    @change="handleModelChange" 
                                                    style="width: 100%;" 
                                                    size="default" 
                                                    placeholder="选择AI模型" 
                                                    popper-class="czbk-select-dropdown"
                                                    :loading="modelsLoading"
                                                >
                                                <el-option-group label="预设模型">
                                                    <el-option 
                                                        v-for="model in presetModels" 
                                                        :key="model.id" 
                                                        :value="model.id"
                                                    >
                                                            <template #default>
                                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                                            <div>
                                                                <div style="font-weight: 500;">{{ model.name }}</div>
                                                                <div style="font-size: 11px; color: #909399; margin-top: 2px;">{{ model.description }}</div>
                                                            </div>
                                                            <el-tag size="small" type="info" style="margin-left: 8px;">{{ model.provider }}</el-tag>
                                                        </div>
                                                            </template>
                                                    </el-option>
                                                </el-option-group>
                                                <el-option-group v-if="customModels.length > 0" label="自定义模型">
                                                    <el-option 
                                                        v-for="model in customModels" 
                                                        :key="model.id" 
                                                        :value="model.id"
                                                    >
                                                            <template #default>
                                                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                                            <div style="flex: 1;">
                                                                <div style="font-weight: 500;">{{ model.name }}</div>
                                                                <div style="font-size: 11px; color: #909399; margin-top: 2px;">{{ model.description || '自定义模型' }}</div>
                                                            </div>
                                                            <div style="display: flex; gap: 4px; align-items: center;">
                                                                <el-tag size="small" type="warning">自定义</el-tag>
                                                            </div>
                                                        </div>
                                                            </template>
                                                    </el-option>
                                                </el-option-group>
                                            </el-select>
                                            
                                            <!-- 显示当前模型信息 -->
                                            <div v-if="currentModelInfo" style="margin-top: 8px; padding: 12px; background: #ffffff; border: 1px solid #e4e7ed; border-radius: 6px; font-size: 12px;">
                                                <div style="font-weight: 500; margin-bottom: 4px; color: #303133;">{{ currentModelInfo.name }}</div>
                                                <div style="color: #606266; margin-bottom: 4px;">{{ currentModelInfo.description }}</div>
                                                <div v-if="currentModelInfo.features && currentModelInfo.features.length > 0" style="margin-top: 6px;">
                                                    <span style="color: #909399;">特点：</span>
                                                    <el-tag 
                                                        v-for="(feature, idx) in (typeof currentModelInfo.features === 'string' ? currentModelInfo.features.split(',') : currentModelInfo.features)" 
                                                        :key="idx" 
                                                        size="small" 
                                                        style="margin-left: 4px; margin-top: 2px;"
                                                    >
                                                        {{ feature.trim() }}
                                                    </el-tag>
                                                </div>
                                            </div>
                                            
                                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                                <el-button 
                                                    type="text" 
                                                    size="small" 
                                                    @click="showCustomModelDialog = true" 
                                                    style="padding: 0;"
                                                >
                                                    ➕ 添加自定义模型
                                                </el-button>
                                                <el-button 
                                                    v-if="customModels.length > 0 && customModels.find(m => m.id === aiModel)"
                                                    type="text" 
                                                    size="small" 
                                                    @click="handleDeleteCustomModel(aiModel)" 
                                                    style="padding: 0; color: #f56c6c;"
                                                >
                                                    🗑️ 删除当前模型
                                                </el-button>
                                            </div>
                                        </div>
                                    </el-space>
                                </el-tab-pane>
                                
                                <!-- 记录 Tab -->
                                <el-tab-pane label="记录" name="record">
                                    <el-space direction="vertical" style="width: 100%;" :size="16">
                                        <!-- 操作按钮 -->
                                        <el-space style="width: 100%;" :size="8">
                                            <el-button @click="handleImportAnswer" style="flex: 1;">📥 导入</el-button>
                                            <el-button type="primary" @click="handleExportAnswer" style="flex: 1;">📤 导出</el-button>
                                            <el-button type="danger" @click="handleClearAnswer" style="flex: 1;">🗑️ 清空</el-button>
                                        </el-space>
                                        
                                        <!-- 统计信息 -->
                                        <div class="czbk-stat-item">
                                            <span class="czbk-stat-label">📚 答案库</span>
                                            <span class="czbk-stat-value">{{ recordCount }} 道题目</span>
                                            <span v-if="recordSearchKeyword || recordFilterType !== 'all'" style="margin-left: 12px; font-size: 12px; color: #909399;">
                                                (显示 {{ filteredRecordCount }} 条)
                                            </span>
                                        </div>
                                        
                                        <!-- 搜索和筛选 -->
                                        <el-space direction="vertical" style="width: 100%;" :size="8">
                                            <el-input
                                                v-model="recordSearchKeyword"
                                                placeholder="搜索题目或答案..."
                                                clearable
                                                @input="handleRecordSearchChange"
                                            >
                                                <template #prefix>
                                                    <span style="font-size: 14px;">🔍</span>
                                                </template>
                                            </el-input>
                                            <el-space style="width: 100%;" :size="8">
                                                <el-select v-model="recordFilterType" @change="handleRecordSearchChange" style="flex: 1;" clearable>
                                                    <el-option label="全部类型" value="all" />
                                                    <el-option label="单选题" value="0" />
                                                    <el-option label="多选题" value="1" />
                                                    <el-option label="判断题" value="2" />
                                                    <el-option label="填空题" value="3" />
                                                    <el-option label="简答题" value="4" />
                                                </el-select>
                                                <el-select v-model="recordSortBy" @change="updateStats" style="flex: 1;">
                                                    <el-option label="按时间" value="time" />
                                                    <el-option label="按题目" value="question" />
                                                    <el-option label="按答案" value="answer" />
                                                </el-select>
                                                <el-button 
                                                    @click="recordSortOrder = recordSortOrder === 'asc' ? 'desc' : 'asc'; updateStats()"
                                                    :icon="recordSortOrder === 'asc' ? '↑' : '↓'"
                                                >
                                                    {{ recordSortOrder === 'asc' ? '升序' : '降序' }}
                                                </el-button>
                                            </el-space>
                                        </el-space>
                                        
                                        <!-- 记录列表 -->
                                        <div style="max-height: 400px; overflow-y: auto; padding: 8px; background: #fafafa; border-radius: 6px;">
                                            <div v-if="paginatedRecords.length === 0" style="color: #909399; text-align: center; padding: 40px;">
                                                <div style="font-size: 48px; margin-bottom: 12px;">📝</div>
                                                <div>{{ recordSearchKeyword || recordFilterType !== 'all' ? '未找到匹配的记录' : '暂无答案记录' }}</div>
                                            </div>
                                            <div v-for="(record, index) in paginatedRecords" :key="record.id || index" class="czbk-answer-item">
                                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                                                    <div class="czbk-answer-question" style="flex: 1;">
                                                        {{ record.question && record.question.length > 80 ? record.question.substring(0, 80) + '...' : (record.question || '无题目') }}
                                                    </div>
                                                    <el-tag 
                                                        :type="record.questionType === '0' ? '' : record.questionType === '1' ? 'success' : record.questionType === '2' ? 'warning' : record.questionType === '3' ? 'info' : 'danger'"
                                                        size="small"
                                                        style="margin-left: 8px; flex-shrink: 0;"
                                                    >
                                                        {{ record.questionType === '0' ? '单选' : record.questionType === '1' ? '多选' : record.questionType === '2' ? '判断' : record.questionType === '3' ? '填空' : record.questionType === '4' ? '简答' : '未知' }}
                                                    </el-tag>
                                                </div>
                                                <div class="czbk-answer-text">
                                                    <strong>答案：</strong>{{ record.answer || '无答案' }}
                                                </div>
                                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                                                    <div class="czbk-answer-source">
                                                        来源：{{ record.source === 'local' ? '本地' : record.source === 'api' ? '云端' : record.source === 'ai' ? 'AI' : record.source || '未知' }}
                                                    </div>
                                                    <div style="font-size: 11px; color: #c0c4cc;">
                                                        {{ formatRecordTime(record.timestamp) }}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- 分页 -->
                                        <el-pagination
                                            v-if="answerRecords.length > recordPageSize"
                                            v-model:current-page="recordCurrentPage"
                                            :page-size="recordPageSize"
                                            :total="answerRecords.length"
                                            layout="prev, pager, next, total"
                                            small
                                            @current-change="updateStats"
                                        />
                                    </el-space>
                                </el-tab-pane>
                            </el-tabs>
                        </el-card>
                        
                        <!-- 自定义模型对话框 -->
                        <el-dialog 
                            v-model="showCustomModelDialog" 
                            title="添加自定义模型" 
                            width="500px"
                            :close-on-click-modal="false"
                        >
                            <el-form :model="customModelForm" label-width="100px" label-position="left">
                                <el-form-item label="模型ID" required>
                                    <el-input v-model="customModelForm.id" placeholder="如: gpt-4, claude-3" />
                                    <div style="font-size: 11px; color: #909399; margin-top: 4px;">用于API调用的模型标识符</div>
                                </el-form-item>
                                <el-form-item label="模型名称" required>
                                    <el-input v-model="customModelForm.name" placeholder="如: GPT-4, Claude 3" />
                                </el-form-item>
                                <el-form-item label="提供商">
                                    <el-input v-model="customModelForm.provider" placeholder="如: OpenAI, Anthropic" />
                                </el-form-item>
                                <el-form-item label="描述">
                                    <el-input 
                                        v-model="customModelForm.description" 
                                        type="textarea" 
                                        :rows="2"
                                        placeholder="模型的简要描述"
                                    />
                                </el-form-item>
                                <el-form-item label="Base URL">
                                    <el-input v-model="customModelForm.baseUrl" placeholder="如: https://api.openai.com/v1（可选）" />
                                </el-form-item>
                                <el-form-item label="特点">
                                    <el-input 
                                        v-model="customModelForm.features" 
                                        placeholder="用逗号分隔，如: 速度快,准确率高,支持中文"
                                    />
                                    <div style="font-size: 11px; color: #909399; margin-top: 4px;">用逗号分隔多个特点</div>
                                </el-form-item>
                            </el-form>
                            <template #footer>
                                <el-button @click="showCustomModelDialog = false">取消</el-button>
                                <el-button type="primary" @click="handleSaveCustomModel">保存</el-button>
                            </template>
                        </el-dialog>
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
                
                // 确保面板在挂载后立即可见
                setTimeout(() => {
                    const mountedHost = document.getElementById('czbk-vue-panel-host');
                    if (mountedHost) {
                        // 强制显示面板
                        mountedHost.style.setProperty('display', 'block', 'important');
                        mountedHost.style.setProperty('visibility', 'visible', 'important');
                        mountedHost.style.setProperty('opacity', '1', 'important');
                        mountedHost.style.setProperty('z-index', '99999', 'important');
                        
                        // 如果位置还没有设置，设置默认位置
                        if (!mountedHost.style.left || mountedHost.style.left === 'auto') {
                            const defaultX = window.innerWidth - 540;
                            const defaultY = 10;
                            mountedHost.style.left = defaultX + 'px';
                            mountedHost.style.top = defaultY + 'px';
                            mountedHost.style.right = 'auto';
                        }
                        
                        utils.log('面板可见性已确保:', {
                            display: mountedHost.style.display,
                            visibility: mountedHost.style.visibility,
                            left: mountedHost.style.left,
                            top: mountedHost.style.top,
                            computedDisplay: window.getComputedStyle(mountedHost).display,
                            computedVisibility: window.getComputedStyle(mountedHost).visibility,
                            computedZIndex: window.getComputedStyle(mountedHost).zIndex,
                            rect: mountedHost.getBoundingClientRect()
                        });
                    } else {
                        utils.log('警告: 挂载后找不到面板元素');
                    }
                }, 100);
                
                // 再次检查，确保面板在Vue组件完全渲染后也可见
                setTimeout(() => {
                    const mountedHost = document.getElementById('czbk-vue-panel-host');
                    if (mountedHost) {
                        const computedStyle = window.getComputedStyle(mountedHost);
                        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
                            utils.log('检测到面板被隐藏，强制显示');
                            mountedHost.style.setProperty('display', 'block', 'important');
                            mountedHost.style.setProperty('visibility', 'visible', 'important');
                        }
                    }
                }, 500);
                
                utils.log('Vue3 + Element Plus控制面板已创建');
                return { host, app };
            } catch (e) {
                const errorMsg = e?.message || e?.toString() || JSON.stringify(e) || '未知错误';
                utils.log('创建Vue控制面板失败:', errorMsg);
                console.error('Vue面板创建错误详情:', e);
                // 不再降级到HTML面板，只使用Vue3+ElementPlus版本
                messageApi.error('控制面板创建失败，请刷新页面重试');
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
                    // 只使用Vue3 + ElementPlus面板
                    await this.createVuePanel();
                }
            }
        }
        };
    
        // ==================== 控制面板模块 ====================
        // 旧版UI已移除，只使用Vue3+ElementPlus版本
    
    // ==================== 答案尝试缓存管理器 ====================
    // 用于记录每道题尝试过的答案，避免重复尝试
    const answerAttemptCache = {
        _cache: {}, // questionId -> [尝试过的答案数组]
        
        // 获取已尝试的答案列表
        getAttempted: function(questionId) {
            return this._cache[questionId] || [];
        },
        
        // 添加尝试过的答案
        addAttempt: function(questionId, answer) {
            if (!this._cache[questionId]) {
                this._cache[questionId] = [];
            }
            const answerStr = Array.isArray(answer) ? answer.sort().join(',') : String(answer);
            if (!this._cache[questionId].includes(answerStr)) {
                this._cache[questionId].push(answerStr);
            }
        },
        
        // 检查答案是否已尝试过
        hasAttempted: function(questionId, answer) {
            const attempted = this.getAttempted(questionId);
            const answerStr = Array.isArray(answer) ? answer.sort().join(',') : String(answer);
            return attempted.includes(answerStr);
        },
        
        // 清除某道题的缓存
        clear: function(questionId) {
            delete this._cache[questionId];
        },
        
        // 清除所有缓存
        clearAll: function() {
            this._cache = {};
        },
        
        // 获取下一个未尝试的选项（用于单选题、判断题）
        getNextOption: function(questionId, questionType, allOptions) {
            const attempted = this.getAttempted(questionId);
            const optionLetters = allOptions || ['A', 'B', 'C', 'D', 'E', 'F'];
            
            // 判断题只需要尝试一次就能排除
            if (questionType === '2') {
                if (attempted.length === 0) {
                    return 'A'; // 先尝试第一个选项
                } else {
                    return 'B'; // 第二个选项就是正确答案
                }
            }
            
            // 单选题：找到第一个未尝试的选项
            for (const option of optionLetters) {
                if (!attempted.includes(option)) {
                    return option;
                }
            }
            
            return null; // 所有选项都尝试过了
        }
    };

    // ==================== 网络请求拦截器 ====================
    // 注意：网络拦截器必须在脚本加载时立即初始化，以便拦截早期请求
    const networkInterceptor = {
        _initialized: false,
        init: function() {
            if (this._initialized) {
                return; // 避免重复初始化
            }
            this._initialized = true;
            // 检查响应数据是否是题目数据格式
            const isQuestionData = function(data) {
                if (!data) return false;
                
                // 检查是否是题目数据格式（resultObject格式，包括res.json格式）
                // res.json格式: { code, errorMessage, resultObject: { ... } }
                // 或者: { res: { resultObject: { ... } } }
                if (data.resultObject || (data.code !== undefined && data.resultObject)) {
                    const result = data.resultObject;
                    return !!(result.danxuan || result.duoxuan || result.panduan || result.tiankong || result.jieda);
                }
                
                // 检查是否是res格式（批改后的数据，包含答案）
                if (data.res && data.res.resultObject) {
                    const result = data.res.resultObject;
                    return !!(result.danxuan || result.duoxuan || result.panduan || result.tiankong || result.jieda);
                }
                
                // 检查是否嵌套在 data 字段中
                if (data.data) {
                    if (data.data.resultObject) {
                        const result = data.data.resultObject;
                        return !!(result.danxuan || result.duoxuan || result.panduan || result.tiankong || result.jieda);
                    }
                    // 如果 data.data 是数组，检查数组元素
                    if (Array.isArray(data.data) && data.data.length > 0) {
                        const firstItem = data.data[0];
                        if (firstItem && typeof firstItem === 'object') {
                            return !!(firstItem.id || firstItem.questionId || firstItem.questionContent);
                        }
                    }
                    // 如果 data.data 是对象，检查是否有题目相关字段
                    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
                        // 检查是否有题目列表字段
                        const questionFields = ['questions', 'questionList', 'items', 'list', 'data'];
                        for (const field of questionFields) {
                            if (data.data[field] && Array.isArray(data.data[field]) && data.data[field].length > 0) {
                                const firstItem = data.data[field][0];
                                if (firstItem && (firstItem.id || firstItem.questionId || firstItem.questionContent)) {
                                    return true;
                                }
                            }
                        }
                    }
                }
                
                // 检查是否是数组格式
                if (Array.isArray(data) && data.length > 0) {
                    const firstItem = data[0];
                    if (Array.isArray(firstItem) && firstItem.length > 0) {
                        return firstItem[0].id !== undefined;
                    }
                    return firstItem.id !== undefined || firstItem.questionId !== undefined || firstItem.questionContent !== undefined;
                }
                
                return false;
            };
            
            // 检查数据是否包含答案（批改后的数据）
            const hasAnswerData = function(data) {
                if (!data) return false;
                // 检查 res.json 格式（包含 code, errorMessage, resultObject）
                if (data.resultObject && (data.code !== undefined || data.errorMessage !== undefined)) {
                    // res.json 格式通常包含批改后的答案
                    return true;
                }
                // 检查res格式（批改后的数据）
                if (data.res && data.res.resultObject) {
                    return true;
                }
                // 检查resultObject中的题目是否包含答案
                if (data.resultObject) {
                    const result = data.resultObject;
                    const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                    for (const type of questionTypes) {
                        if (result[type] && result[type].lists) {
                            for (const item of result[type].lists) {
                                // 检查是否有答案字段（stuAnswer表示学生答案，answer/correctAnswer表示正确答案）
                                if (item.stuAnswer || item.answer || item.correctAnswer || item.rightAnswer) {
                                    return true;
                                }
                            }
                        }
                    }
                }
                // 检查数组格式
                if (Array.isArray(data)) {
                    const flattenArray = (arr) => {
                        const result = [];
                        for (const item of arr) {
                            if (Array.isArray(item)) {
                                result.push(...flattenArray(item));
                            } else if (item && typeof item === 'object') {
                                result.push(item);
                            }
                        }
                        return result;
                    };
                    const flatData = flattenArray(data);
                    for (const item of flatData) {
                        if (item.stuAnswer || item.answer || item.correctAnswer || item.rightAnswer) {
                            return true;
                        }
                    }
                }
                return false;
            };

            // 处理题目数据
            const handleQuestionData = async function(data, source) {
                try {
                    // 如果数据嵌套在 data 字段中，先提取出来
                    if (data.data && typeof data.data === 'object') {
                        // 检查 data.data 是否包含题目数据
                        if (isQuestionData(data.data)) {
                            utils.log(`📦 检测到数据嵌套在data字段中，提取处理...`);
                            data = data.data;
                        } else if (data.data.resultObject) {
                            // 如果 data.data 有 resultObject，直接使用
                            utils.log(`📦 检测到resultObject嵌套在data字段中，提取处理...`);
                            data = { resultObject: data.data.resultObject, code: data.code, errorMessage: data.errorMessage };
                        }
                    }
                    
                    if (isQuestionData(data)) {
                        const hasAnswer = hasAnswerData(data);
                        const dataType = hasAnswer ? '批改后的题目数据（包含答案）' : '题目数据';
                        utils.log(`检测到${dataType}请求（${source}），自动加载...`);
                        
                        // 转换为答案库格式和上传格式
                        let importData = {};
                        let uploadData = null;  // 用于上传到云端的数据
                        
                        // 先检查是否是 res.json 格式（在整个函数作用域中定义）
                        const isResJsonFormat = data.resultObject && (data.code !== undefined || data.errorMessage !== undefined);
                        
                        if (isResJsonFormat) {
                            utils.log(`🎯 检测到 res.json 格式数据（${source}）！`);
                            utils.log(`   结构: code=${data.code}, errorMessage=${data.errorMessage}, resultObject存在=${!!data.resultObject}`);
                        }
                        
                        // 处理res格式（批改后的数据，包含正确答案）
                        // 如果是 res.json 格式（包含 code, errorMessage, resultObject），直接上传整个文件
                        if (isResJsonFormat) {
                            // res.json 格式：直接上传整个文件，由后端解析
                            utils.log(`📦 检测到 res.json 格式，准备上传完整文件到后端...`);
                            uploadData = data;  // 上传完整的 res.json 结构
                            const result = data.resultObject;
                            
                            // 统计题目数量（用于日志）
                            let totalQuestions = 0;
                            const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                            questionTypes.forEach(key => {
                                if (result[key] && result[key].lists) {
                                    totalQuestions += result[key].lists.length;
                                }
                            });
                            utils.log(`   res.json 包含 ${totalQuestions} 道题目，将直接上传到后端解析`);
                        } else if (data.res && data.res.resultObject) {
                            uploadData = { res: data.res };  // 保持原始格式用于上传
                            const result = data.res.resultObject;
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
                                            // 优先使用正确答案字段
                                            const answer = q.correctAnswer || q.rightAnswer || q.answer || q.stuAnswer || '';
                                            importData[id] = {
                                                id: id,
                                                questionId: q.questionId || id,
                                                questionContent: q.questionContent || q.questionContentText || '',
                                                questionType: type,
                                                answer: answer,
                                                solution: q.solution || q.analysis || '',
                                                timestamp: Date.now()
                                            };
                                        }
                                    });
                                }
                            });
                        } else if (data.resultObject) {
                            // 处理resultObject格式
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
                                            // 优先使用正确答案字段
                                            const answer = q.correctAnswer || q.rightAnswer || q.answer || q.stuAnswer || '';
                                            importData[id] = {
                                                id: id,
                                                questionId: q.questionId || id,
                                                questionContent: q.questionContent || q.questionContentText || '',
                                                questionType: type,
                                                answer: answer,
                                                solution: q.solution || q.analysis || '',
                                                timestamp: Date.now()
                                            };
                                        }
                                    });
                                }
                            });
                            
                            // 如果包含答案，准备上传数据（保持原始格式）
                            if (hasAnswer) {
                                // 如果是 res.json 格式（包含 code, errorMessage），直接上传整个文件
                                if (data.code !== undefined || data.errorMessage !== undefined) {
                                    uploadData = data;  // 上传完整的 res.json 结构，由后端解析
                                } else {
                                uploadData = { data: { resultObject: result } };
                                }
                            }
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
                                    // 优先使用正确答案字段
                                    const answer = q.correctAnswer || q.rightAnswer || q.answer || q.stuAnswer || '';
                                    importData[id] = {
                                        id: id,
                                        questionId: q.questionId || id,
                                        questionContent: q.questionContent || '',
                                        questionType: q.type || q.questionType || '0',
                                        answer: answer,
                                        solution: q.solution || q.analysis || '',
                                        timestamp: Date.now()
                                    };
                                }
                            });
                            
                            // 如果包含答案，准备上传数据
                            if (hasAnswer) {
                                uploadData = { answerRecords: flatData };
                            }
                        }
                        
                        // res.json 格式：直接上传完整数据到后端，不进行前端提取
                        if (isResJsonFormat && uploadData) {
                            // 自动纠错：检查批改响应中的错误答案并自动修正
                            if (config.features.autoCorrectAnswer && hasAnswer) {
                                await this.handleAutoCorrect(data.resultObject);
                            }
                            
                            // 直接上传完整 res.json 数据到后端，由后端解析
                            utils.log(`📤 检测到 res.json 格式，直接上传完整数据到后端解析（不进行前端提取）...`);
                            
                            const uploadResponse = await utils.request({
                                method: 'POST',
                                url: `${config.api.baseUrl}${config.api.uploadEndpoint}`,
                                data: uploadData,  // 上传完整的 res.json 结构
                                timeout: 60000,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-API-Key': apiKey
                                }
                            });
                            
                            if (uploadResponse && uploadResponse.code === 1) {
                                const stats = uploadResponse.data || {};
                                let totalQuestions = 0;
                                if (uploadData.resultObject) {
                                    const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                                    questionTypes.forEach(key => {
                                        if (uploadData.resultObject[key] && uploadData.resultObject[key].lists) {
                                            totalQuestions += uploadData.resultObject[key].lists.length;
                                        }
                                    });
                                }
                                utils.log(`✅ 已自动上传完整 res.json 数据到云端（总计: ${stats.total || totalQuestions}, 新增: ${stats.new || 0}, 更新: ${stats.updated || 0}）`);
                                utils.log(`   ✅ res.json 文件已成功上传并由后端解析`);
                            } else {
                                utils.log(`⚠️ 上传到云端失败: ${uploadResponse?.message || '未知错误'}`);
                            }
                            
                            return true;
                        }
                        
                        // 其他格式：保存到本地并上传（保留原有逻辑）
                        if (Object.keys(importData).length > 0) {
                            // 1. 保存到本地
                            const result = answerDBManager.merge(importData);
                            // 尝试更新面板统计（如果面板已创建）
                            try {
                                const vuePanel = document.getElementById('czbk-vue-panel-host');
                                if (vuePanel && vuePanel.__vue_app__) {
                                    // Vue面板已创建，可以通过事件更新统计
                                }
                            } catch (e) {
                                // 忽略错误
                            }
                            utils.log(`已自动从网络请求加载题目数据到本地，共 ${Object.keys(importData).length} 道题目`);
                        }
                        
                        // 2. 上传到云端（非 res.json 格式，res.json 格式已在上面处理）
                        const shouldUpload = hasAnswer && config.features.autoUploadToCloud && apiKey && uploadData && !isResJsonFormat;
                        
                        if (shouldUpload) {
                                try {
                                    utils.log(`📤 开始上传题目数据到云端（其他格式，${Object.keys(importData).length} 道题目）...`);
                                    
                                    const uploadResponse = await utils.request({
                                        method: 'POST',
                                        url: `${config.api.baseUrl}${config.api.uploadEndpoint}`,
                                        data: uploadData,
                                        timeout: 60000,  // 增加超时时间，因为 res.json 可能很大
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'X-API-Key': apiKey
                                        }
                                    });
                                    
                                    if (uploadResponse && uploadResponse.code === 1) {
                                        const stats = uploadResponse.data || {};
                                        const totalQuestions = stats.total || Object.keys(importData).length;
                                        utils.log(`✅ 已自动上传题目数据到云端（总计: ${totalQuestions}, 新增: ${stats.new || 0}, 更新: ${stats.updated || 0}）`);
                                        
                                        if (isResJsonFormat) {
                                            utils.log(`   ✅ res.json 文件已成功上传并由后端解析`);
                                        }
                                    } else {
                                        utils.log(`⚠️ 上传到云端失败: ${uploadResponse?.message || '未知错误'}`);
                                        if (uploadResponse) {
                                            console.error('上传响应:', uploadResponse);
                                        }
                                    }
                                } catch (uploadError) {
                                    utils.log(`⚠️ 上传到云端失败: ${uploadError.message || uploadError}`);
                                    console.error('上传错误详情:', uploadError);
                                }
                            } else if (hasAnswer && !apiKey) {
                                utils.log(`📝 检测到批改后的题目数据（包含答案），但未配置API Key，无法上传到云端`);
                        } else if (hasAnswer && !isResJsonFormat && !config.features.autoUploadToCloud) {
                            utils.log(`📝 检测到批改后的题目数据（包含答案），但自动上传功能已关闭`);
                            }
                            
                            return true;
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
                
                // 检查是否是作业详情请求（findStudentBusywork）
                const isBusyworkRequest = url.includes('findStudentBusywork') || url.includes('busywork');
                
                // 检查响应内容是否为题目数据
                try {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const clonedResponse = response.clone();
                        const data = await clonedResponse.json();
                        
                        if (data) {
                            // 如果是作业详情请求，添加详细日志
                            if (isBusyworkRequest) {
                                utils.log(`🔍 检测到作业详情请求（fetch）: ${url}`);
                                utils.log(`   响应数据结构: ${Object.keys(data).join(', ')}`);
                                if (data.data) {
                                    utils.log(`   data字段类型: ${typeof data.data}, 是否为数组: ${Array.isArray(data.data)}`);
                                    if (data.data && typeof data.data === 'object') {
                                        utils.log(`   data对象键: ${Object.keys(data.data).join(', ')}`);
                                    }
                                }
                            }
                            
                            // 添加详细日志
                            if (data.resultObject || (data.code !== undefined || data.errorMessage !== undefined)) {
                                utils.log(`🔍 检测到可能的题目数据（fetch）: ${url}`);
                                utils.log(`   格式: ${data.resultObject ? 'resultObject' : 'unknown'}, code: ${data.code}, errorMessage: ${data.errorMessage}`);
                            }
                        
                        if (isQuestionData(data)) {
                                utils.log(`✅ 确认是题目数据格式（fetch），开始处理...`);
                            handleQuestionData(data, 'fetch');
                            } else if (isBusyworkRequest && data.data) {
                                // 检查作业详情数据格式
                                utils.log(`🔍 检查作业详情数据格式...`);
                                // 尝试从 data 字段中提取题目数据
                                if (data.data.resultObject || (data.data.code !== undefined && data.data.resultObject)) {
                                    utils.log(`✅ 在data字段中找到resultObject格式，开始处理...`);
                                    handleQuestionData(data.data, 'fetch');
                                } else if (Array.isArray(data.data)) {
                                    utils.log(`✅ 在data字段中找到数组格式，开始处理...`);
                                    handleQuestionData(data.data, 'fetch');
                                } else if (data.data && typeof data.data === 'object') {
                                    // 尝试直接处理 data 对象
                                    utils.log(`✅ 尝试处理data对象...`);
                                    handleQuestionData(data.data, 'fetch');
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 如果是作业详情请求，记录错误
                    if (isBusyworkRequest) {
                        utils.log(`⚠️ 解析作业详情响应失败: ${e.message}`);
                    }
                    // 忽略其他解析错误
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
                        // 检查是否是作业详情请求
                        const url = xhr._url || '';
                        const isBusyworkRequest = url.includes('findStudentBusywork') || url.includes('busywork');
                        
                        let data = null;
                        if (xhr.responseType === '' || xhr.responseType === 'text') {
                            const responseText = xhr.responseText;
                            if (responseText) {
                                try {
                                    data = JSON.parse(responseText);
                                } catch (e) {
                                    // 尝试提取JSONP回调中的数据
                                    const jsonpMatch = responseText.match(/callback\d+\((.+)\)/);
                                    if (jsonpMatch) {
                                        try {
                                            data = JSON.parse(jsonpMatch[1]);
                                        } catch (e2) {
                                            return;
                                        }
                                    } else {
                                        return;
                                    }
                                }
                            }
                        } else if (xhr.responseType === 'json') {
                            data = xhr.response;
                        }
                        
                        if (data) {
                            // 如果是作业详情请求，添加详细日志
                            if (isBusyworkRequest) {
                                utils.log(`🔍 检测到作业详情请求（XHR）: ${url}`);
                                utils.log(`   响应数据结构: ${Object.keys(data).join(', ')}`);
                                if (data.data) {
                                    utils.log(`   data字段类型: ${typeof data.data}, 是否为数组: ${Array.isArray(data.data)}`);
                                    if (data.data && typeof data.data === 'object') {
                                        utils.log(`   data对象键: ${Object.keys(data.data).join(', ')}`);
                                    }
                                }
                            }
                            
                            // 添加详细日志
                            if (data.resultObject || (data.code !== undefined || data.errorMessage !== undefined)) {
                                utils.log(`🔍 检测到可能的题目数据（XHR）: ${url}`);
                                utils.log(`   格式: ${data.resultObject ? 'resultObject' : 'unknown'}, code: ${data.code}, errorMessage: ${data.errorMessage}`);
                            }
                            
                            if (isQuestionData(data)) {
                                utils.log(`✅ 确认是题目数据格式（XHR），开始处理...`);
                            handleQuestionData(data, 'XHR');
                            } else if (isBusyworkRequest && data.data) {
                                // 检查作业详情数据格式
                                utils.log(`🔍 检查作业详情数据格式...`);
                                // 尝试从 data 字段中提取题目数据
                                if (data.data.resultObject || (data.data.code !== undefined && data.data.resultObject)) {
                                    utils.log(`✅ 在data字段中找到resultObject格式，开始处理...`);
                                    handleQuestionData(data.data, 'XHR');
                                } else if (Array.isArray(data.data)) {
                                    utils.log(`✅ 在data字段中找到数组格式，开始处理...`);
                                    handleQuestionData(data.data, 'XHR');
                                } else if (data.data && typeof data.data === 'object') {
                                    // 尝试直接处理 data 对象
                                    utils.log(`✅ 尝试处理data对象...`);
                                    handleQuestionData(data.data, 'XHR');
                                }
                            }
                        }
                    } catch (e) {
                        // 如果是作业详情请求，记录错误
                        const url = xhr._url || '';
                        const isBusyworkRequest = url.includes('findStudentBusywork') || url.includes('busywork');
                        if (isBusyworkRequest) {
                            utils.log(`⚠️ 解析作业详情响应失败: ${e.message}`);
                        }
                        // 忽略其他解析错误
                    }
                });
                
                return originalSend.apply(this, args);
            };
            
            utils.log('网络请求拦截器已启动，将自动检测并加载题目数据');
        },
        
        // 立即初始化网络拦截器（在脚本加载时立即执行）
        _initImmediate: function() {
            // 在脚本加载的最早阶段初始化，确保能拦截到所有请求
            try {
                this.init();
            } catch (e) {
                console.error('网络拦截器初始化失败:', e);
            }
        },
        
        // 传智播客专属：检测考试是否已完成
        isCzbkExamCompleted: function() {
            try {
                // 方法1: 检查是否有提交按钮（未完成考试有"保存退出"和"提交作业"按钮）
                const subBtnContainer = document.querySelector('[class*="subBtn"], .subBtn');
                if (subBtnContainer) {
                    const buttons = subBtnContainer.querySelectorAll('button');
                    let hasSaveBtn = false;
                    let hasSubmitBtn = false;
                    
                    buttons.forEach(btn => {
                        const text = (btn.innerText || btn.textContent || '').trim();
                        if (text.includes('保存退出')) {
                            hasSaveBtn = true;
                        }
                        if (text.includes('提交作业')) {
                            hasSubmitBtn = true;
                        }
                    });
                    
                    // 如果有"保存退出"或"提交作业"按钮，说明考试未完成
                    if (hasSaveBtn || hasSubmitBtn) {
                        utils.log('检测到提交按钮，考试未完成');
                        return false;
                    }
                }
                
                // 方法2: 检查截止时间是否已过（传智播客专属判断方法）
                const timeContainer = document.querySelector('[class*="top_right_start_mes"], .top_right_start_mes');
                if (timeContainer) {
                    const items = timeContainer.querySelectorAll('[class*="item"], .item');
                    let deadlineText = '';
                    
                    items.forEach(item => {
                        const spans = item.querySelectorAll('span');
                        if (spans.length >= 2) {
                            const firstSpan = spans[0];
                            const secondSpan = spans[1];
                            const firstText = (firstSpan.innerText || firstSpan.textContent || '').trim();
                            const secondText = (secondSpan.innerText || secondSpan.textContent || '').trim();
                            
                            if (firstText.includes('截止时间：') || firstText.includes('截止时间')) {
                                deadlineText = secondText;
                            }
                        }
                    });
                    
                    if (deadlineText) {
                        try {
                            // 解析截止时间（格式：2025-12-02 17:44:00 或 2025-11-28 15:49:46）
                            // 将日期格式转换为标准格式
                            const normalizedDate = deadlineText.replace(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/, '$1/$2/$3 $4:$5:$6');
                            const deadline = new Date(normalizedDate);
                            const now = new Date();
                            
                            // 如果当前时间超过截止时间，说明考试已完成
                            if (now > deadline) {
                                utils.log(`截止时间已过（${deadlineText}），考试已完成`);
                                return true;
                            } else {
                                utils.log(`截止时间未到（${deadlineText}），考试未完成`);
                                return false;
                            }
                        } catch (e) {
                            utils.log('解析截止时间失败:', e, '原始文本:', deadlineText);
                        }
                    }
                }
                
                // 方法3: 检查URL是否包含lookPaper（查看试卷页面通常是已完成）
                const url = window.location.href;
                if (url.includes('lookPaper')) {
                    // 如果URL包含lookPaper且没有提交按钮，认为是已完成
                    if (!subBtnContainer || !subBtnContainer.querySelector('button')) {
                        utils.log('检测到lookPaper页面且无提交按钮，考试已完成');
                        return true;
                    }
                }
                
                // 方法4: 检查页面中是否有批改后的标记（备用方法）
                const hasCorrectAnswer = document.querySelector('.is-correct, .correct-answer, [class*="correct"]');
                const hasGradedData = window.__examData__ || window.__paperData__ || window.__gradedData__;
                const pageText = document.body.innerText || '';
                const hasCompletedText = /已完成|已批改|查看答案|正确答案/i.test(pageText);
                
                if (hasCorrectAnswer || hasGradedData || hasCompletedText) {
                    utils.log('检测到批改后的标记，考试已完成');
                    return true;
                }
                
                // 默认返回false（未完成）
                return false;
            } catch (e) {
                utils.log('检测考试完成状态失败:', e);
                return false;
            }
        },
        
        // 主动请求作业详情数据（直接上传完整数据到后端，不进行前端提取）
        fetchBusyworkData: async function(busyworkId) {
            if (!busyworkId) {
                utils.log('⚠️ 未提供busyworkId，无法主动请求数据');
                return null;
            }
            
            try {
                utils.log(`📡 主动请求作业详情数据: busyworkId=${busyworkId}`);
                const url = `https://stu.ityxb.com/back/bxg/my/busywork/findStudentBusywork?busyworkId=${busyworkId}&t=${Date.now()}`;
                
                const response = await utils.request({
                    method: 'GET',
                    url: url,
                    timeout: 30000
                });
                
                if (response) {
                    utils.log(`✅ 成功获取作业详情数据，直接上传完整数据到后端...`);
                    // 直接上传完整数据到后端，不进行前端解析
                    await this.uploadFullDataToBackend(response, '主动请求');
                    return response;
                }
                return null;
            } catch (e) {
                utils.log(`❌ 主动请求作业详情数据失败: ${e.message}`);
                console.error('主动请求错误详情:', e);
                return null;
            }
        },
        
        // 上传完整数据到后端（不进行前端提取）
        uploadFullDataToBackend: async function(data, source) {
            try {
                const apiKey = window.apiKey || GM_getValue('czbk_api_key', '');
                if (!apiKey) {
                    utils.log('⚠️ 未配置API Key，无法上传数据到后端');
                    return;
                }
                
                // 检查是否是 res.json 格式
                const isResJsonFormat = data.resultObject && (data.code !== undefined || data.errorMessage !== undefined);
                
                if (isResJsonFormat) {
                    utils.log(`📤 上传完整 res.json 数据到后端（${source}）...`);
                    
                    // 统计题目数量（用于日志）
                    let totalQuestions = 0;
                    if (data.resultObject) {
                        const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                        questionTypes.forEach(key => {
                            if (data.resultObject[key] && data.resultObject[key].lists) {
                                totalQuestions += data.resultObject[key].lists.length;
                            }
                        });
                    }
                    utils.log(`   res.json 包含 ${totalQuestions} 道题目，将完整上传到后端解析`);
                    
                    const uploadResponse = await utils.request({
                        method: 'POST',
                        url: `${config.api.baseUrl}${config.api.uploadEndpoint}`,
                        data: data,  // 上传完整的 res.json 结构
                        timeout: 60000,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': apiKey
                        }
                    });
                    
                    if (uploadResponse && uploadResponse.code === 1) {
                        const stats = uploadResponse.data || {};
                        utils.log(`✅ 已自动上传完整数据到云端（总计: ${stats.total || totalQuestions}, 新增: ${stats.new || 0}, 更新: ${stats.updated || 0}）`);
                        utils.log(`   ✅ res.json 文件已成功上传并由后端解析`);
                    } else {
                        utils.log(`⚠️ 上传到云端失败: ${uploadResponse?.message || '未知错误'}`);
                    }
                } else {
                    utils.log(`⚠️ 数据不是 res.json 格式，跳过上传`);
                }
            } catch (e) {
                utils.log(`⚠️ 上传完整数据到后端失败: ${e.message}`);
                console.error('上传错误详情:', e);
            }
        },
        
        // 检测已完成考试页面并主动请求数据（不进行DOM提取）
        checkCompletedExamPage: async function() {
            try {
                // 使用传智播客专属方法检测
                if (!this.isCzbkExamCompleted()) {
                    return; // 考试未完成，不处理
                }
                
                utils.log('检测到已完成考试页面（传智播客），尝试主动请求完整数据...');
                
                // 从URL中提取busyworkId，主动请求完整数据并上传到后端
                const url = window.location.href;
                const busyworkIdMatch = url.match(/busywork[\/=]([a-zA-Z0-9]+)/);
                if (busyworkIdMatch) {
                    const busyworkId = busyworkIdMatch[1];
                    utils.log(`从URL中提取到busyworkId: ${busyworkId}`);
                    // 主动请求完整数据并直接上传到后端（不进行前端提取）
                    await this.fetchBusyworkData(busyworkId);
                } else {
                    utils.log('⚠️ 未找到busyworkId，无法主动请求数据');
                }
                
                // 不再进行DOM提取，所有数据通过网络拦截器和主动请求获取
                return;
            } catch (e) {
                utils.log('检测已完成考试页面失败:', e);
            }
        }
    };

    // ==================== 初始化 ====================
    const init = async function() {
        if (isInitialized) return;
        isInitialized = true;

        utils.log('脚本初始化开始...');
        
        // 暴露 autoAnswer 对象到全局，供 Vue 组件使用
        window.autoAnswer = autoAnswer;

        // 1. 加载API Key和配置
        apiKey = GM_getValue('czbk_api_key', '');
        const savedApiUrl = GM_getValue('czbk_api_url', '');
        if (savedApiUrl) {
            config.api.baseUrl = savedApiUrl;
        }

        // API Key现在在配置页面中设置，不再使用弹窗
        if (apiKey) {
            utils.log('API Key已从配置中加载');
        } else {
            utils.log('API Key未配置，请在配置页面中设置');
        }

        // 2. 加载本地答案库
        answerDBManager.load();

        // 3. 启动网络请求拦截器
        networkInterceptor.init();
        
        // 4. 检测已完成考试页面（延迟执行，等待页面加载完成）
        setTimeout(() => {
            networkInterceptor.checkCompletedExamPage();
        }, 2000);
        
        // 监听页面变化（SPA应用可能动态加载内容）
        let lastUrl = location.href;
        const checkUrlChange = () => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                setTimeout(() => {
                    networkInterceptor.checkCompletedExamPage();
                }, 2000);
            }
        };
        
        // 使用MutationObserver监听DOM变化
        const observer = new MutationObserver(() => {
            checkUrlChange();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 也监听popstate事件（浏览器前进后退）
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                networkInterceptor.checkCompletedExamPage();
            }, 2000);
        });

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

    // ==================== 立即初始化网络拦截器 ====================
    // 在脚本加载时立即初始化网络拦截器，确保能拦截到所有早期请求
    // 不等待DOM加载完成，因为网络请求可能在DOM加载前就发送了
    try {
        networkInterceptor.init();
        utils.log('✅ 网络拦截器已在脚本加载时立即初始化（document-start模式）');
    } catch (e) {
        console.error('网络拦截器立即初始化失败:', e);
    }
    
    // 页面加载完成后初始化其他功能
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

    // 暴露全局函数到window对象，方便在控制台调试
    // 注意：必须在全局作用域中定义，不能放在IIFE内部
})();

// 在全局作用域中定义调试函数（在IIFE外部）
(function() {
    'use strict';
    
    window.showCzbkPanel = function() {
        const host = document.getElementById('czbk-vue-panel-host');
        if (host) {
            host.style.setProperty('display', 'block', 'important');
            host.style.setProperty('visibility', 'visible', 'important');
            host.style.setProperty('opacity', '1', 'important');
            host.style.setProperty('z-index', '99999', 'important');
            
            // 如果位置在屏幕外，重置位置
            const rect = host.getBoundingClientRect();
            if (rect.x < 0 || rect.x > window.innerWidth || rect.y < 0 || rect.y > window.innerHeight) {
                host.style.left = (window.innerWidth - 540) + 'px';
                host.style.top = '10px';
                host.style.right = 'auto';
            }
            
            console.log('面板已强制显示', {
                display: host.style.display,
                visibility: host.style.visibility,
                left: host.style.left,
                top: host.style.top,
                rect: host.getBoundingClientRect()
            });
            return true;
        } else {
            console.error('找不到面板元素，请刷新页面');
            return false;
        }
    };
    
    window.resetCzbkPanel = function() {
        if (typeof GM_setValue === 'function') {
            GM_setValue('czbk_panel_position', null);
            GM_setValue('czbk_panel_minimized', false);
            console.log('面板位置已重置，请刷新页面');
        } else {
            console.log('请在Tampermonkey脚本上下文中使用，或刷新页面');
        }
    };
    
    console.log('控制台调试函数已加载:');
    console.log('  - showCzbkPanel() : 强制显示面板');
    console.log('  - resetCzbkPanel() : 重置面板位置（需要刷新页面）');
})();

// 在全局作用域中定义调试函数（在IIFE外部，确保可以在控制台访问）
// 注意：这些函数需要在脚本加载后立即可用
if (typeof window !== 'undefined') {
    window.showCzbkPanel = window.showCzbkPanel || function() {
        const host = document.getElementById('czbk-vue-panel-host');
        if (host) {
            host.style.setProperty('display', 'block', 'important');
            host.style.setProperty('visibility', 'visible', 'important');
            host.style.setProperty('opacity', '1', 'important');
            host.style.setProperty('z-index', '99999', 'important');
            
            // 如果位置在屏幕外，重置位置
            const rect = host.getBoundingClientRect();
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            if (rect.x < -50 || rect.x > screenWidth - 100 || rect.y < -50 || rect.y > screenHeight - 100) {
                const defaultX = Math.max(10, screenWidth - 540);
                const defaultY = 10;
                host.style.left = defaultX + 'px';
                host.style.top = defaultY + 'px';
                host.style.right = 'auto';
            }
            
            console.log('面板已强制显示', {
                display: host.style.display,
                visibility: host.style.visibility,
                left: host.style.left,
                top: host.style.top,
                rect: host.getBoundingClientRect(),
                screenWidth: screenWidth,
                screenHeight: screenHeight
            });
            return true;
        } else {
            console.error('找不到面板元素，请刷新页面');
            return false;
        }
    };
    
    window.resetCzbkPanel = window.resetCzbkPanel || function() {
        if (typeof GM_setValue === 'function') {
            GM_setValue('czbk_panel_position', null);
            GM_setValue('czbk_panel_minimized', false);
            console.log('面板位置已重置，请刷新页面');
        } else {
            console.log('请在Tampermonkey脚本上下文中使用，或刷新页面');
        }
    };
}