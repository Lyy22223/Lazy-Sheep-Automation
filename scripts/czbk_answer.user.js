// ==UserScript==
// @name         传智播客答题脚本|刷课脚本|AI答题
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  传智播客自动答题、刷课、AI答题一体化脚本。支持本地答案库查询、云端API查询、AI答题
// @author       CZBK Team
// @match        https://stu.ityxb.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const config = {
        // API配置
        api: {
            baseUrl: 'http://8.138.237.189:8000',
            searchEndpoint: '/api/search',
            aiEndpoint: '/api/ai/answer',
            keyInfoEndpoint: '/api/key/status'
        },
        
        // 功能开关
        features: {
            autoAnswer: false,        // 自动答题（默认关闭）
            autoSubmit: false,        // 自动提交（默认关闭）
            skipAnswered: true,       // 跳过已答题
            useAI: true,              // 启用AI答题
            showControlPanel: true    // 显示控制面板
        },
        
        // 答题配置
        answer: {
            delay: 500,              // 答题延迟（毫秒）
            retryCount: 3,           // 重试次数
            retryDelay: 1000         // 重试延迟
        },
        
        // AI配置
        ai: {
            enabled: true,            // 启用AI
            timeout: 30000,          // 超时时间（30秒）
            model: 'gpt-3.5-turbo',  // AI模型
            temperature: 0.3         // 温度参数
        }
    };

    // ==================== 全局变量 ====================
    let apiKey = GM_getValue('czbk_api_key', '');
    let answerDB = {};  // 本地答案库
    let answerLogs = [];  // 答题日志
    let isInitialized = false;

    // ==================== 工具函数 ====================
    const utils = {
        // 延迟函数
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

        // 日志记录
        log: function(...args) {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            const logEntry = {
                time: new Date().toLocaleTimeString(),
                message: message
            };
            
            answerLogs.unshift(logEntry);
            if (answerLogs.length > 100) {
                answerLogs = answerLogs.slice(0, 100);
            }
            
            console.log('[传智播客脚本]', ...args);
        },

        // 获取题目ID
        getQuestionId: (element) => {
            return element.getAttribute('data-id') || 
                   element.closest('[data-id]')?.getAttribute('data-id') || 
                   null;
        },

        // 获取题目内容
        getQuestionText: (element) => {
            const titleBox = element.querySelector('.question-title-box .myEditorTxt');
            return titleBox ? titleBox.textContent.trim() : '';
        },

        // 获取题目类型
        getQuestionType: (element) => {
            // 0=单选, 1=多选, 2=判断, 3=填空, 4=简答
            const radio = element.querySelector('input[type="radio"]');
            const checkbox = element.querySelector('input[type="checkbox"]');
            const fillInput = element.querySelector('input.tk_input');
            const editor = element.querySelector('.editor-box');
            
            if (checkbox) return '1';  // 多选
            if (radio) return element.querySelectorAll('input[type="radio"]').length === 2 ? '2' : '0';  // 判断或单选
            if (fillInput) return '3';  // 填空
            if (editor) return '4';     // 简答
            return '0';
        },

        // 检查题目是否已答
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

        // HTTP请求封装
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

    // ==================== 答案库管理 ====================
    const answerDBManager = {
        // 从GM_getValue加载本地答案库
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

        // 保存答案库到GM_setValue
        save: function() {
            try {
                GM_setValue('czbk_answer_db', answerDB);
                utils.log('答案库已保存到本地缓存');
            } catch (e) {
                utils.log('保存答案库失败:', e);
            }
        },

        // 合并答案数据（导入时使用）
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
                // 如果是对象，遍历所有键
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

        // 导入JSON数据
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

        // 导出JSON数据
        exportJSON: function() {
            try {
                return JSON.stringify(answerDB, null, 2);
            } catch (e) {
                utils.log('导出JSON失败:', e);
                return null;
            }
        },

        // 添加单条答案
        add: function(questionId, questionData) {
            const id = questionId || questionData.id || questionData.questionId;
            if (id) {
                answerDB[id] = questionData;
                this.save();
                return true;
            }
            return false;
        },

        // 查询答案（本地库）
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

            // 文本匹配（简单实现，匹配前30个字符）
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

        // 获取答案库统计
        getStats: function() {
            return {
                total: Object.keys(answerDB).length,
                byType: {
                    '0': 0, // 单选
                    '1': 0, // 多选
                    '2': 0, // 判断
                    '3': 0, // 填空
                    '4': 0  // 简答
                }
            };
        },

        // 清空答案库
        clear: function() {
            answerDB = {};
            this.save();
            utils.log('答案库已清空');
        }
    };

    // ==================== API查询模块 ====================
    const apiQuery = {
        // 查询答案（云端API）
        search: async function(questionData) {
            if (!apiKey) {
                throw new Error('未配置API Key');
            }

            try {
                const response = await utils.request({
                    method: 'POST',
                    url: `${config.api.baseUrl}${config.api.searchEndpoint}`,
                    data: {
                        question_id: questionData.questionId,
                        question_content: questionData.questionText,
                        question_type: questionData.questionType,
                        platform: 'czbk',
                        options: questionData.options
                    }
                });

                return {
                    found: response.code === 1,
                    answer: response.answer || [],
                    solution: response.solution,
                    confidence: response.confidence,
                    source: 'api'
                };
            } catch (e) {
                utils.log('API查询失败:', e);
                throw e;
            }
        },

        // AI答题
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
                        question_content: questionData.questionText,
                        question_type: questionData.questionType,
                        options: questionData.options,
                        platform: 'czbk'
                    },
                    timeout: config.ai.timeout
                });

                return {
                    found: response.code === 1,
                    answer: response.answer || [],
                    solution: response.solution,
                    source: 'ai'
                };
            } catch (e) {
                utils.log('AI答题失败:', e);
                throw e;
            }
        },

        // 查询API Key状态
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
        // 填充单选题
        fillDanxuan: async function(questionItem, answer) {
            const radio = questionItem.querySelector(`input[type="radio"][value="${answer}"]`);
            if (radio) {
                radio.click();
                await utils.sleep(config.answer.delay);
                return true;
            }
            return false;
        },

        // 填充多选题
        fillDuoxuan: async function(questionItem, answers) {
            let successCount = 0;
            for (const answer of answers) {
                const checkbox = questionItem.querySelector(`input[type="checkbox"][value="${answer}"]`);
                if (checkbox && !checkbox.checked) {
                    checkbox.click();
                    successCount++;
                    await utils.sleep(config.answer.delay);
                }
            }
            return successCount === answers.length;
        },

        // 填充判断题
        fillPanduan: async function(questionItem, answer) {
            return await this.fillDanxuan(questionItem, answer);
        },

        // 填充填空题
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

        // 填充简答题
        fillJianda: async function(questionItem, answer) {
            const editorBox = questionItem.querySelector('.editor-box');
            if (!editorBox) return false;

            // 尝试多种编辑器类型
            const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
            if (textarea) {
                textarea.value = answer;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }

            const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
            if (iframe) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const body = iframeDoc.body;
                    if (body) {
                        body.textContent = answer;
                        body.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    }
                } catch (e) {
                    utils.log('iframe填充失败:', e);
                }
            }

            const contentEditable = editorBox.querySelector('[contenteditable="true"]');
            if (contentEditable) {
                contentEditable.textContent = answer;
                contentEditable.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }

            return false;
        },

        // 通用填充方法
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
        // 查询单个题目答案
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
            for (const item of questionItems) {
                try {
                    const result = await this.query(item);
                    results.push(result);
                    await utils.sleep(200); // 避免请求过快
                } catch (e) {
                    results.push({
                        found: false,
                        error: e.message
                    });
                }
            }
            return results;
        }
    };

    // ==================== 刷课功能 ====================
    const courseAuto = {
        // 检测是否为视频页面
        isVideoPage: function() {
            return document.querySelector('.preview_play-container') !== null ||
                   document.querySelector('#videoPlayer') !== null ||
                   document.querySelector('.video-play-box') !== null;
        },

        // 自动完成课程（类似finishWxCourse）
        finishCourse: async function() {
            try {
                utils.log('开始自动完成课程...');
                
                // 1. 检查是否有finishWxCourse函数
                if (typeof window.finishWxCourse === 'function') {
                    utils.log('找到finishWxCourse函数，正在执行...');
                    window.finishWxCourse();
                    utils.log('finishWxCourse执行完成');
                    return true;
                }

                // 2. 尝试查找并点击完成按钮
                const finishButtons = [
                    '.finish-btn',
                    '.complete-btn',
                    '[data-action="finish"]',
                    'button:contains("完成")',
                    'a:contains("完成")'
                ];

                for (const selector of finishButtons) {
                    const btn = document.querySelector(selector);
                    if (btn) {
                        btn.click();
                        utils.log(`找到完成按钮并点击: ${selector}`);
                        await utils.sleep(1000);
                        return true;
                    }
                }

                // 3. 尝试通过视频播放器完成
                const video = document.querySelector('video');
                if (video) {
                    // 快进到结尾
                    video.currentTime = video.duration - 1;
                    await utils.sleep(1000);
                    utils.log('视频已快进到结尾');
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
                video.play();
                // 设置播放速度
                video.playbackRate = 2.0;
                utils.log('视频已开始播放，速度: 2.0x');
                
                // 监听视频结束
                video.addEventListener('ended', () => {
                    utils.log('视频播放完成');
                    this.finishCourse();
                });
            }
        }
    };

    // ==================== UI界面模块 ====================
    const ui = {
        // 创建查询按钮（参考chaoxing.js）
        createQueryButton: function() {
            const btn = document.createElement('button');
            btn.id = 'czbk-query-btn';
            btn.innerHTML = '🔍 查询答案';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
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

        // 创建结果弹窗（参考chaoxing.js）
        createResultPanel: function() {
            const panel = document.createElement('div');
            panel.id = 'czbk-result-panel';
            panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
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
                html = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0;">题目</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word; border-bottom: 1px solid #e0e0e0;">${result.questionData.questionText.substring(0, 100)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0;">答案</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word; border-bottom: 1px solid #e0e0e0;">${answer}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368; border-bottom: 1px solid #e0e0e0;">来源</td>
                            <td style="padding: 8px 12px; color: #202124; border-bottom: 1px solid #e0e0e0;">
                                ${result.source === 'local' ? '本地库' : result.source === 'local-text' ? '本地库(文本匹配)' : result.source === 'api' ? '云端API' : 'AI答题'}
                            </td>
                        </tr>
                        ${result.solution ? `
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 500; color: #5F6368;">解析</td>
                            <td style="padding: 8px 12px; color: #202124; word-break: break-word;">${result.solution}</td>
                        </tr>
                        ` : ''}
                    </table>
                `;
            } else {
                html = `
                    <div style="padding: 12px; color: #5F6368; text-align: center;">
                        ${result.message || '未找到答案'}
                    </div>
                `;
            }

            content.innerHTML = html;
            panel.style.display = 'block';
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
                z-index: 9999;
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

        // 初始化UI
        init: function() {
            // 创建查询按钮和结果面板
            this.createQueryButton();
            this.createResultPanel();

            // 如果是视频页面，创建刷课按钮
            if (courseAuto.isVideoPage()) {
                this.createCourseButton();
            }
        }
    };

    // ==================== 初始化 ====================
    const init = async function() {
        if (isInitialized) return;
        isInitialized = true;

        utils.log('脚本初始化开始...');

        // 1. 加载API Key
        apiKey = GM_getValue('czbk_api_key', '');
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

        // 3. 初始化UI
        ui.init();

        // 4. 如果是答题页面，可以自动答题
        const questionItems = document.querySelectorAll('.question-item, [data-id]');
        if (questionItems.length > 0 && config.features.autoAnswer) {
            utils.log('检测到答题页面，开始自动答题...');
            // 可以在这里添加批量自动答题逻辑
        }

        utils.log('脚本初始化完成');
    };

    // 页面加载完成后初始化
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // 监听页面变化（SPA应用）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });
})();