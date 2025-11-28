// ==UserScript==
// @name         传智播客答题脚本
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  自动填写单选题、多选题、判断题、填空题和简答题，支持AI答题和答题过程记录
// @author       懒羊羊
// @match        https://stu.ityxb.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置选项
    const config = {
        // 自动答题开关
        autoAnswer: true,
        // 答题延迟（毫秒）
        answerDelay: 500,
        // 是否显示控制面板
        showControlPanel: true,
        // 是否自动提交
        autoSubmit: false,
        // 是否跳过已答题（true=跳过已答，false=重新答题）
        skipAnsweredQuestions: true,
        // AI配置
        aiConfig: {
            enabled: false,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            model: 'gpt-3.5-turbo',
            temperature: 0.3,
            maxTokens: 1500, // 增加token限制，避免答案被截断
            // 是否使用流式响应
            stream: false,
            // 高级参数
            topP: 1.0,
            frequencyPenalty: 0.0,
            presencePenalty: 0.0,
            // 是否自动从网络请求获取题库
            autoFetchQuestions: true,
            // 是否在获取到题库后自动使用AI分析题目、选项和solution获取答案
            autoAnalyzeWithAI: true,
            // 请求重试配置
            retryOn429: true, // 遇到429错误时是否重试
            maxRetries: 3, // 最大重试次数
            retryDelay: 2000, // 重试延迟（毫秒），默认2秒
            // 请求频率限制
            requestDelay: 1000, // 每次AI请求之间的延迟（毫秒），默认1秒
            batchDelay: 2000 // 批量请求之间的延迟（毫秒），默认2秒
        }
    };

    // 答案数据库（从 index.json 中提取）
    let answerDB = {};
    // ID 映射表：questionId -> id（用于支持 fasfa.json 格式）
    let idMapping = {};
    // 答题日志
    let answerLogs = [];
    const MAX_LOG_ITEMS = 100; // 最大日志条数

    // 工具函数
    const utils = {
        // 延迟函数
        sleep: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // 日志输出
        log: function(...args) {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            const logEntry = {
                time: new Date().toLocaleTimeString(),
                message: message
            };
            
            // 添加到日志数组
            answerLogs.unshift(logEntry);
            
            // 限制日志数量
            if (answerLogs.length > MAX_LOG_ITEMS) {
                answerLogs = answerLogs.slice(0, MAX_LOG_ITEMS);
            }
            
            // 输出到控制台
            console.log('[自动答题]', ...args);
            
            // 更新面板日志显示（如果面板已创建）
            if (typeof controlPanel !== 'undefined' && controlPanel.updateLogs) {
                controlPanel.updateLogs();
            }
        },

        // 获取题目ID
        getQuestionId: function(element) {
            return element.getAttribute('data-id') || 
                   element.closest('[data-id]')?.getAttribute('data-id') || 
                   null;
        },

        // 获取题目内容文本
        getQuestionText: function(element) {
            const titleBox = element.querySelector('.question-title-box .myEditorTxt');
            if (titleBox) {
                return titleBox.textContent.trim();
            }
            return '';
        },

        // 检查题目是否已答
        isQuestionAnswered: function(questionItem) {
            // 检查单选题/判断题：是否有选中的radio
            const checkedRadio = questionItem.querySelector('input[type="radio"]:checked');
            if (checkedRadio) {
                return true;
            }
            
            // 检查多选题：是否有选中的checkbox
            const checkedCheckbox = questionItem.querySelector('input[type="checkbox"]:checked');
            if (checkedCheckbox) {
                return true;
            }
            
            // 检查填空题：输入框是否有值
            const fillInputs = questionItem.querySelectorAll('input.tk_input[data-questionid]');
            if (fillInputs.length > 0) {
                for (const input of fillInputs) {
                    if (input.value && input.value.trim()) {
                        return true;
                    }
                }
            }
            
            // 检查简答题：编辑器是否有内容
            const editorBox = questionItem.querySelector('.editor-box');
            if (editorBox) {
                // 检查textarea
                const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                if (textarea && textarea.value && textarea.value.trim()) {
                    return true;
                }
                // 检查iframe
                const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
                if (iframe) {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const iframeBody = iframeDoc.body;
                        if (iframeBody && iframeBody.textContent && iframeBody.textContent.trim()) {
                            return true;
                        }
                    } catch (e) {
                        // 忽略跨域错误
                    }
                }
                // 检查contentEditable
                const contentEditable = editorBox.querySelector('[contenteditable="true"]');
                if (contentEditable && contentEditable.textContent && contentEditable.textContent.trim()) {
                    return true;
                }
            }
            
            return false;
        },

        // 从solution中提取答案
        extractAnswerFromSolution: function(solution, questionType) {
            if (!solution) return null;

            // 单选题和多选题：尝试提取选项字母
            if (questionType === '0' || questionType === '1') {
                const patterns = [
                    /答案是[：:]\s*([A-Z]+)/i,
                    /正确答案是[：:]\s*([A-Z]+)/i,
                    /应该选择[：:]\s*([A-Z]+)/i,
                    /选择[：:]\s*([A-Z]+)/i,
                    /([A-Z])\s*[、。，,]/g
                ];
                
                for (const pattern of patterns) {
                    const match = solution.match(pattern);
                    if (match) {
                        return match[1] || match[0].charAt(0);
                    }
                }
            }

            // 判断题
            if (questionType === '2') {
                if (solution.includes('错误') || solution.includes('不正确') || solution.includes('不对')) {
                    return '错';
                }
                if (solution.includes('正确') || solution.includes('对')) {
                    return '对';
                }
            }

            return null;
        },

        // 清理markdown代码块标记，只保留内容
        cleanMarkdownCodeBlocks: function(text) {
            if (!text) return text;
            
            // 移除markdown代码块标记（```language 或 ```）
            // 匹配 ```language 或 ``` 开头和结尾
            let cleaned = text.replace(/```[\w]*\n?/g, '');
            
            // 移除剩余的 ``` 标记（如果还有）
            cleaned = cleaned.replace(/```/g, '');
            
            // 清理多余的换行（保留单个换行）
            cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
            
            // 去除首尾空白
            cleaned = cleaned.trim();
            
            return cleaned;
        }
    };

    // 答题记录管理器
    const answerRecordManager = {
        records: [], // 答题记录数组
        
        // 初始化答题记录（从题库加载）
        initFromAnswerDB: function() {
            this.records = [];
            const seenQuestions = new Set(); // 用于去重，基于题目内容
            
            Object.keys(answerDB).forEach(id => {
                const question = answerDB[id];
                const questionContent = (question.questionContent || '').trim();
                
                // 如果题目内容为空，跳过
                if (!questionContent) {
                    return;
                }
                
                // 使用题目内容作为唯一标识，避免重复
                const contentKey = questionContent;
                
                // 如果已经存在相同内容的题目，跳过（避免重复）
                if (seenQuestions.has(contentKey)) {
                    return;
                }
                
                seenQuestions.add(contentKey);
                
                // 优先使用 id 作为主键，如果 id 不存在则使用 questionId
                const primaryId = id;
                const questionId = question.questionId || id;
                
                this.records.push({
                    id: primaryId,
                    questionId: questionId,
                    type: question.type || '',
                    questionContent: questionContent,
                    answer: question.answer || '',
                    solution: question.solution || '',
                    timestamp: Date.now(),
                    status: question.answer ? '已答' : '未答'
                });
            });
            
            this.saveToStorage();
            utils.log(`已初始化答题记录，共 ${this.records.length} 道题目`);
        },
        
        // 更新答题记录
        updateRecord: function(questionId, answer, questionContent, questionType) {
            const normalizedContent = (questionContent || '').trim();
            
            // 优先精确匹配：先匹配 id，再匹配 questionId，同时检查题目内容
            let record = this.records.find(r => {
                const idMatch = r.id === questionId || r.questionId === questionId;
                const contentMatch = normalizedContent && r.questionContent && 
                    r.questionContent.trim() === normalizedContent;
                // 如果题目内容匹配，优先使用内容匹配（更可靠）
                if (contentMatch) {
                    return true;
                }
                // 否则使用ID匹配
                return idMatch;
            });
            
            if (record) {
                // 更新现有记录
                record.answer = answer;
                record.status = '已答';
                record.timestamp = Date.now();
                // 如果题目内容为空，更新它
                if (!record.questionContent && normalizedContent) {
                    record.questionContent = normalizedContent;
                }
                // 如果类型为空，更新它
                if (!record.type && questionType) {
                    record.type = questionType;
                }
            } else {
                // 如果记录不存在，创建新记录
                this.records.push({
                    id: questionId,
                    questionId: questionId,
                    type: questionType || '',
                    questionContent: normalizedContent,
                    answer: answer,
                    solution: '',
                    timestamp: Date.now(),
                    status: '已答'
                });
            }
            this.saveToStorage();
            this.updateUI();
        },
        
        // 保存到本地存储
        saveToStorage: function() {
            GM_setValue('answerRecords', this.records);
        },
        
        // 从本地存储加载
        loadFromStorage: function() {
            const stored = GM_getValue('answerRecords', null);
            if (stored) {
                this.records = stored;
                utils.log('已从本地存储加载答题记录，共', this.records.length, '道题目');
                return true;
            }
            return false;
        },
        
        // 清空记录
        clear: function() {
            this.records = [];
            this.saveToStorage();
            this.updateUI();
            utils.log('答题记录已清空');
        },
        
        // 导出答题记录
        export: function(format = 'json') {
            if (this.records.length === 0) {
                alert('没有答题记录可导出');
                return;
            }
            
            // 按时间戳倒序排序（最新的在前）
            const sortedRecords = [...this.records].sort((a, b) => {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                return timeB - timeA; // 倒序：最新的在前
            });
            
            let content = '';
            let filename = '';
            let mimeType = '';
            
            if (format === 'json') {
                content = JSON.stringify(sortedRecords, null, 2);
                filename = `答题记录_${new Date().toISOString().slice(0, 10)}.json`;
                mimeType = 'application/json';
            } else if (format === 'txt') {
                content = sortedRecords.map((r, index) => {
                    const typeMap = {
                        '0': '单选题',
                        '1': '多选题',
                        '2': '判断题',
                        '3': '填空题',
                        '4': '简答题'
                    };
                    let text = `\n${index + 1}. [${typeMap[r.type] || '未知类型'}] ${r.status}\n`;
                    text += `题目：${r.questionContent}\n`;
                    text += `答案：${r.answer || '未答'}\n`;
                    if (r.solution) {
                        text += `解析：${r.solution}\n`;
                    }
                    text += `时间：${new Date(r.timestamp).toLocaleString()}\n`;
                    text += '─'.repeat(50);
                    return text;
                }).join('\n');
                filename = `答题记录_${new Date().toISOString().slice(0, 10)}.txt`;
                mimeType = 'text/plain';
            } else if (format === 'csv') {
                const headers = ['序号', '题目ID', '类型', '题目内容', '答案', '状态', '时间'];
                const rows = sortedRecords.map((r, index) => {
                    const typeMap = {
                        '0': '单选题',
                        '1': '多选题',
                        '2': '判断题',
                        '3': '填空题',
                        '4': '简答题'
                    };
                    return [
                        index + 1,
                        r.id,
                        typeMap[r.type] || '未知',
                        `"${(r.questionContent || '').replace(/"/g, '""')}"`,
                        `"${(r.answer || '').replace(/"/g, '""')}"`,
                        r.status,
                        new Date(r.timestamp).toLocaleString()
                    ].join(',');
                });
                content = [headers.join(','), ...rows].join('\n');
                filename = `答题记录_${new Date().toISOString().slice(0, 10)}.csv`;
                mimeType = 'text/csv';
            }
            
            // 创建下载链接
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            utils.log(`答题记录已导出为 ${filename}`);
        },
        
        // 更新UI显示
        updateUI: function() {
            const container = document.getElementById('answerRecordContainer');
            if (!container) return;
            
            if (this.records.length === 0) {
                container.innerHTML = '<div style="color: #909399; text-align: center; padding: 20px;">暂无答题记录</div>';
                return;
            }
            
            const typeMap = {
                '0': '单选题',
                '1': '多选题',
                '2': '判断题',
                '3': '填空题',
                '4': '简答题'
            };
            
            const statusColor = {
                '已答': '#67C23A',
                '未答': '#909399'
            };
            
            // 按时间戳倒序排序（最新的在前）
            const sortedRecords = [...this.records].sort((a, b) => {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                return timeB - timeA; // 倒序：最新的在前
            });
            
            let html = '<div style="max-height: 400px; overflow-y: auto;">';
            sortedRecords.forEach((record, index) => {
                const typeName = typeMap[record.type] || '未知类型';
                const statusColorValue = statusColor[record.status] || '#909399';
                html += `
                    <div style="border: 1px solid #EBEEF5; border-radius: 4px; padding: 10px; margin-bottom: 10px; background: #fff;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-weight: bold; color: #303133;">${index + 1}. [${typeName}]</span>
                            <span style="color: ${statusColorValue}; font-size: 12px;">${record.status}</span>
                        </div>
                        <div style="color: #606266; margin-bottom: 6px; font-size: 13px; line-height: 1.5;">
                            <strong>题目：</strong>${record.questionContent || '无'}
                        </div>
                        <div style="color: #409EFF; margin-bottom: 6px; font-size: 13px;">
                            <strong>答案：</strong>${record.answer || '未答'}
                        </div>
                        ${record.solution ? `<div style="color: #909399; font-size: 12px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #EBEEF5;">
                            <strong>解析：</strong>${record.solution}
                        </div>` : ''}
                        <div style="color: #C0C4CC; font-size: 11px; margin-top: 6px;">
                            ${new Date(record.timestamp).toLocaleString()}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        },
        
        // 导入答案（从答题记录JSON格式）
        importAnswers: function(jsonData) {
            try {
                if (!Array.isArray(jsonData)) {
                    throw new Error('导入的数据格式错误：必须是数组格式');
                }
                
                if (jsonData.length === 0) {
                    alert('导入的数据为空');
                    return;
                }
                
                let importedCount = 0;
                let updatedCount = 0;
                let skippedCount = 0;
                
                // 将答题记录格式转换为answerDB格式
                jsonData.forEach(record => {
                    if (!record.id && !record.questionId) {
                        skippedCount++;
                        return;
                    }
                    
                    // 使用id或questionId作为键
                    const key = record.id || record.questionId;
                    
                    // 如果答案为空，跳过
                    if (!record.answer || record.answer.trim() === '') {
                        skippedCount++;
                        return;
                    }
                    
                    // 检查是否已存在
                    const exists = answerDB[key];
                    
                    // 转换为answerDB格式
                    const answerData = {
                        type: record.type || null,
                        answer: record.answer,
                        solution: record.solution || '',
                        questionContent: record.questionContent || '',
                        questionId: record.questionId || record.id || null
                    };
                    
                    // 如果已存在，更新；否则新增
                    if (exists) {
                        // 合并数据，保留原有数据，只更新答案相关字段
                        answerDB[key] = {
                            ...exists,
                            answer: record.answer,
                            solution: record.solution || exists.solution || '',
                            questionContent: record.questionContent || exists.questionContent || '',
                            type: record.type || exists.type || null
                        };
                        updatedCount++;
                    } else {
                        answerDB[key] = answerData;
                        importedCount++;
                    }
                    
                    // 如果questionId和id不同，也建立映射
                    if (record.questionId && record.id && record.questionId !== record.id) {
                        answerDB[record.questionId] = answerData;
                    }
                });
                
                // 保存到本地存储
                answerDBManager.saveToStorage();
                
                // 更新答题记录（合并导入的记录）
                jsonData.forEach(record => {
                    if (record.id || record.questionId) {
                        const key = record.id || record.questionId;
                        // 如果记录中有答案，更新答题记录
                        if (record.answer && record.answer.trim() !== '') {
                            this.updateRecord(
                                key,
                                record.answer,
                                record.questionContent,
                                record.type
                            );
                        }
                    }
                });
                
                const totalCount = importedCount + updatedCount;
                const message = `导入完成！\n` +
                    `新增答案: ${importedCount} 道\n` +
                    `更新答案: ${updatedCount} 道\n` +
                    `跳过（无答案）: ${skippedCount} 道\n` +
                    `总计: ${totalCount} 道题目`;
                
                alert(message);
                utils.log(`答案导入完成：新增 ${importedCount} 道，更新 ${updatedCount} 道，跳过 ${skippedCount} 道`);
                utils.log(`当前答案数据库共有 ${Object.keys(answerDB).length} 道题目`);
            } catch (error) {
                alert('导入失败：' + error.message);
                utils.log('导入答案失败:', error);
            }
        }
    };

    // 答案数据库管理
    const answerDBManager = {
        // 从JSON数据加载答案
        loadFromJSON: function(jsonData) {
            try {
                // 展平嵌套数组格式（如 fasfa.json 中的格式）
                function flattenArray(arr) {
                    const result = [];
                    for (const item of arr) {
                        if (Array.isArray(item)) {
                            // 如果是数组，递归展平
                            result.push(...flattenArray(item));
                        } else if (item && typeof item === 'object' && item.id) {
                            // 如果是对象，直接添加
                            result.push(item);
                        }
                    }
                    return result;
                }

                // 检查是否是数组格式（简单数组或嵌套数组）
                if (Array.isArray(jsonData) && jsonData.length > 0) {
                    answerDB = {};
                    
                    // 展平数组（处理嵌套数组格式）
                    const flatData = flattenArray(jsonData);
                    
                    flatData.forEach(q => {
                        const key = q.id;
                        if (key) {
                            let answer = q.answer;
                            
                            // 处理单选题的数组格式答案，如 ["D"] 转换为 "D"
                            if (Array.isArray(answer) && answer.length === 1) {
                                // 单选题：单个元素的数组转换为字符串
                                answer = String(answer[0]);
                            } else if (Array.isArray(answer) && answer.length > 1) {
                                // 多选题：保持数组格式
                                answer = answer;
                            }
                            
                            answerDB[key] = {
                                type: null, // 新格式不指定类型，由答题函数自动判断
                                answer: answer || '',
                                solution: q.solution || '',
                                questionContent: q.questionContent || ''
                            };
                        }
                    });
                    utils.log('答案数据库加载成功（数组格式），共', Object.keys(answerDB).length, '道题目');
                    return true;
                }

                // 原有的嵌套格式处理
                const result = jsonData.resultObject || jsonData;
                answerDB = {};

                // 处理单选题
                if (result.danxuan && result.danxuan.lists) {
                    result.danxuan.lists.forEach(q => {
                        const answerData = {
                            type: '0',
                            answer: utils.extractAnswerFromSolution(q.solution, '0') || q.answer || '',
                            solution: q.solution || '',
                            questionContent: q.questionContent || q.questionContentText || '',
                            questionId: q.questionId || q.id || null // 保存 questionId 用于匹配
                        };
                        // 同时使用 id 和 questionId 作为键，以支持两种ID格式
                        if (q.id) {
                            answerDB[q.id] = answerData;
                        }
                        if (q.questionId && q.questionId !== q.id) {
                            answerDB[q.questionId] = answerData;
                            // 建立映射：questionId -> id（用于 fasfa.json 格式）
                            if (q.id) {
                                idMapping[q.questionId] = q.id;
                            }
                        }
                    });
                }

                // 处理多选题
                if (result.duoxuan && result.duoxuan.lists) {
                    result.duoxuan.lists.forEach(q => {
                        const answerData = {
                            type: '1',
                            answer: utils.extractAnswerFromSolution(q.solution, '1') || q.answer || '',
                            solution: q.solution || '',
                            questionContent: q.questionContent || q.questionContentText || '',
                            questionId: q.questionId || q.id || null
                        };
                        // 同时使用 id 和 questionId 作为键，以支持两种ID格式
                        if (q.id) {
                            answerDB[q.id] = answerData;
                        }
                        if (q.questionId && q.questionId !== q.id) {
                            answerDB[q.questionId] = answerData;
                        }
                    });
                }

                // 处理判断题
                if (result.panduan && result.panduan.lists) {
                    result.panduan.lists.forEach(q => {
                        const answerData = {
                            type: '2',
                            answer: utils.extractAnswerFromSolution(q.solution, '2') || q.answer || '',
                            solution: q.solution || '',
                            questionContent: q.questionContent || q.questionContentText || '',
                            questionId: q.questionId || q.id || null
                        };
                        // 同时使用 id 和 questionId 作为键，以支持两种ID格式
                        if (q.id) {
                            answerDB[q.id] = answerData;
                        }
                        if (q.questionId && q.questionId !== q.id) {
                            answerDB[q.questionId] = answerData;
                        }
                    });
                }

                // 处理填空题
                if (result.tiankong && result.tiankong.lists) {
                    result.tiankong.lists.forEach(q => {
                        const answerData = {
                            type: '3',
                            answer: q.answer || '',
                            solution: q.solution || '',
                            questionContent: q.questionContent || q.questionContentText || '',
                            questionId: q.questionId || q.id || null
                        };
                        // 同时使用 id 和 questionId 作为键，以支持两种ID格式
                        if (q.id) {
                            answerDB[q.id] = answerData;
                        }
                        if (q.questionId && q.questionId !== q.id) {
                            answerDB[q.questionId] = answerData;
                        }
                    });
                }

                // 处理简答题
                if (result.jieda && result.jieda.lists) {
                    result.jieda.lists.forEach(q => {
                        const answerData = {
                            type: '4',
                            answer: q.answer || '',
                            solution: q.solution || '',
                            questionContent: q.questionContent || q.questionContentText || '',
                            questionId: q.questionId || q.id || null
                        };
                        // 同时使用 id 和 questionId 作为键，以支持两种ID格式
                        if (q.id) {
                            answerDB[q.id] = answerData;
                        }
                        if (q.questionId && q.questionId !== q.id) {
                            answerDB[q.questionId] = answerData;
                        }
                    });
                }

                utils.log('答案数据库加载成功，共', Object.keys(answerDB).length, '道题目');
                return true;
            } catch (error) {
                utils.log('加载答案数据库失败:', error);
                return false;
            }
        },

        // 从本地存储加载
        loadFromStorage: function() {
            const stored = GM_getValue('answerDB', null);
            if (stored) {
                answerDB = stored;
                utils.log('从本地存储加载答案数据库，共', Object.keys(answerDB).length, '道题目');
                return true;
            }
            return false;
        },

        // 保存到本地存储
        saveToStorage: function() {
            GM_setValue('answerDB', answerDB);
            utils.log('答案数据库已保存到本地存储');
        },

        // 获取答案
        getAnswer: function(questionId) {
            // 首先直接查找
            if (answerDB[questionId]) {
                return answerDB[questionId];
            }
            // 如果没找到，尝试通过映射查找（支持 fasfa.json 格式，其中 id 实际上是 questionId）
            if (idMapping[questionId]) {
                const mappedId = idMapping[questionId];
                return answerDB[mappedId] || null;
            }
            return null;
        },

        // 去重：基于题目内容去重
        deduplicateByContent: function() {
            const contentMap = {}; // 题目内容 -> 题目ID列表
            const duplicates = []; // 重复的题目ID
            
            // 收集所有题目的内容
            Object.keys(answerDB).forEach(id => {
                const question = answerDB[id];
                const content = (question.questionContent || '').trim();
                if (content) {
                    if (!contentMap[content]) {
                        contentMap[content] = [];
                    }
                    contentMap[content].push(id);
                }
            });
            
            // 找出重复的题目
            Object.keys(contentMap).forEach(content => {
                const ids = contentMap[content];
                if (ids.length > 1) {
                    // 保留第一个，标记其他的为重复
                    duplicates.push(...ids.slice(1));
                }
            });
            
            // 删除重复的题目
            duplicates.forEach(id => {
                delete answerDB[id];
            });
            
            if (duplicates.length > 0) {
                utils.log(`去重完成，删除了 ${duplicates.length} 道重复题目`);
            }
            
            return duplicates.length;
        },

        // 使用AI批量分析solution字段提取答案
        analyzeSolutionsWithAI: async function() {
            if (!config.aiConfig.enabled || !config.aiConfig.baseUrl || !config.aiConfig.apiKey) {
                utils.log('AI未配置，跳过solution分析');
                return 0;
            }

            // 收集需要分析的题目（有solution但没有answer的）
            const questionsToAnalyze = [];
            Object.keys(answerDB).forEach(id => {
                const question = answerDB[id];
                if (question.solution && !question.answer) {
                    questionsToAnalyze.push({
                        id: id,
                        type: question.type,
                        solution: question.solution,
                        questionContent: question.questionContent || ''
                    });
                }
            });

            if (questionsToAnalyze.length === 0) {
                utils.log('没有需要分析的题目');
                return 0;
            }

            utils.log(`开始使用AI批量分析 ${questionsToAnalyze.length} 道题目的solution字段...`);

            let successCount = 0;
            let batchSize = 10; // 每批处理10道题目

            // 分批处理，避免一次性发送太多请求
            for (let i = 0; i < questionsToAnalyze.length; i += batchSize) {
                const batch = questionsToAnalyze.slice(i, i + batchSize);
                
                // 检查是否已停止
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止，取消AI分析');
                    break;
                }

                // 为每道题目构建分析请求
                const analysisPromises = batch.map(async (q) => {
                    try {
                        // 构建分析提示词
                        let prompt = `请从以下题目的解析中提取正确答案。\n\n`;
                        prompt += `题目：${q.questionContent}\n\n`;
                        prompt += `解析：${q.solution}\n\n`;
                        
                        if (q.type === '0') {
                            prompt += `这是一道单选题，请只回答选项字母（如A、B、C、D）。`;
                        } else if (q.type === '1') {
                            prompt += `这是一道多选题，请用逗号分隔选项字母（如A,B,C）。`;
                        } else if (q.type === '2') {
                            prompt += `这是一道判断题，请只回答"正确"或"错误"。`;
                        } else if (q.type === '3') {
                            prompt += `这是一道填空题，请直接给出答案内容。`;
                        } else if (q.type === '4') {
                            prompt += `这是一道简答题，请简要回答。`;
                        }

                        const answer = await aiAnswerManager.callAI(
                            prompt,
                            config.aiConfig.baseUrl,
                            config.aiConfig.apiKey,
                            config.aiConfig.model
                        );

                        if (answer) {
                            // 根据题目类型处理答案
                            let processedAnswer = answer.trim();
                            
                            if (q.type === '0') {
                                // 单选题：提取单个字母
                                const match = processedAnswer.toUpperCase().match(/[A-Z]/);
                                processedAnswer = match ? match[0] : processedAnswer.charAt(0).toUpperCase();
                            } else if (q.type === '1') {
                                // 多选题：提取多个字母
                                const matches = processedAnswer.toUpperCase().match(/[A-Z]/g);
                                processedAnswer = matches ? matches.join(',') : processedAnswer;
                            } else if (q.type === '2') {
                                // 判断题：转换为"对"或"错"
                                processedAnswer = (processedAnswer.includes('正确') || processedAnswer.includes('对')) ? '对' : '错';
                            }

                            // 更新答案数据库
                            if (answerDB[q.id]) {
                                answerDB[q.id].answer = processedAnswer;
                                successCount++;
                                utils.log(`AI分析成功 [${q.id}]: ${processedAnswer}`);
                            }
                        }
                    } catch (error) {
                        utils.log(`AI分析失败 [${q.id}]: ${error.message}`);
                    }
                });

                // 等待当前批次完成
                await Promise.all(analysisPromises);
                
                // 批次间稍作延迟，避免请求过快
                if (i + batchSize < questionsToAnalyze.length) {
                    await utils.sleep(500);
                }
            }

            if (successCount > 0) {
                utils.log(`AI批量分析完成，成功分析 ${successCount} 道题目`);
                this.saveToStorage();
            }

            return successCount;
        },

        // 从原始题库数据中批量分析题目、选项和solution
        analyzeQuestionsFromData: async function(jsonData) {
            if (!config.aiConfig.enabled || !config.aiConfig.baseUrl || !config.aiConfig.apiKey) {
                utils.log('AI未配置，跳过题目分析');
                return 0;
            }

            if (!config.aiConfig.autoAnalyzeWithAI) {
                utils.log('自动AI分析已禁用');
                return 0;
            }

            // 从JSON数据中提取所有题目
            const questionsToAnalyze = [];
            const result = jsonData.resultObject || jsonData;

            // 提取单选题
            if (result.danxuan && result.danxuan.lists) {
                result.danxuan.lists.forEach(q => {
                    if (!q.answer || !answerDB[q.id] || !answerDB[q.id].answer) {
                        const options = (q.questionOptionList || []).map(opt => opt.optionContent || opt.content || '').filter(Boolean);
                        questionsToAnalyze.push({
                            id: q.id,
                            questionId: q.questionId,
                            type: '0',
                            questionContent: q.questionContent || q.questionContentText || '',
                            options: options,
                            solution: q.solution || ''
                        });
                    }
                });
            }

            // 提取多选题
            if (result.duoxuan && result.duoxuan.lists) {
                result.duoxuan.lists.forEach(q => {
                    if (!q.answer || !answerDB[q.id] || !answerDB[q.id].answer) {
                        const options = (q.questionOptionList || []).map(opt => opt.optionContent || opt.content || '').filter(Boolean);
                        questionsToAnalyze.push({
                            id: q.id,
                            questionId: q.questionId,
                            type: '1',
                            questionContent: q.questionContent || q.questionContentText || '',
                            options: options,
                            solution: q.solution || ''
                        });
                    }
                });
            }

            // 提取判断题
            if (result.panduan && result.panduan.lists) {
                result.panduan.lists.forEach(q => {
                    if (!q.answer || !answerDB[q.id] || !answerDB[q.id].answer) {
                        questionsToAnalyze.push({
                            id: q.id,
                            questionId: q.questionId,
                            type: '2',
                            questionContent: q.questionContent || q.questionContentText || '',
                            options: [],
                            solution: q.solution || ''
                        });
                    }
                });
            }

            // 提取填空题
            if (result.tiankong && result.tiankong.lists) {
                result.tiankong.lists.forEach(q => {
                    if (!q.answer || !answerDB[q.id] || !answerDB[q.id].answer) {
                        questionsToAnalyze.push({
                            id: q.id,
                            questionId: q.questionId,
                            type: '3',
                            questionContent: q.questionContent || q.questionContentText || '',
                            options: [],
                            solution: q.solution || ''
                        });
                    }
                });
            }

            // 提取简答题
            if (result.jieda && result.jieda.lists) {
                result.jieda.lists.forEach(q => {
                    if (!q.answer || !answerDB[q.id] || !answerDB[q.id].answer) {
                        questionsToAnalyze.push({
                            id: q.id,
                            questionId: q.questionId,
                            type: '4',
                            questionContent: q.questionContent || q.questionContentText || '',
                            options: [],
                            solution: q.solution || ''
                        });
                    }
                });
            }

            if (questionsToAnalyze.length === 0) {
                utils.log('没有需要AI分析的题目（所有题目都有答案）');
                return 0;
            }

            utils.log(`开始使用AI批量分析 ${questionsToAnalyze.length} 道题目（包含题目、选项和solution）...`);

            let successCount = 0;
            let batchSize = 5; // 每批处理5道题目，避免请求过快

            // 分批处理
            for (let i = 0; i < questionsToAnalyze.length; i += batchSize) {
                const batch = questionsToAnalyze.slice(i, i + batchSize);
                
                // 检查是否已停止
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止，取消AI分析');
                    break;
                }

                // 为每道题目构建分析请求
                const analysisPromises = batch.map(async (q) => {
                    try {
                        // 构建完整的分析提示词
                        let prompt = `题目：${q.questionContent}\n\n`;
                        
                        // 如果有选项，添加选项
                        if (q.options && q.options.length > 0) {
                            prompt += '选项：\n';
                            q.options.forEach((opt, index) => {
                                const letter = String.fromCharCode(65 + index); // A, B, C, D...
                                prompt += `${letter}. ${opt}\n`;
                            });
                            prompt += '\n';
                        }
                        
                        // 如果有solution，添加解析
                        if (q.solution) {
                            prompt += `解析：${q.solution}\n\n`;
                        }
                        
                        // 根据题目类型添加提示
                        if (q.type === '0') {
                            prompt += '这是一道单选题，请选择唯一正确答案，只回答选项字母（如A、B、C、D）。';
                        } else if (q.type === '1') {
                            prompt += '这是一道多选题，请选择所有正确答案，用逗号分隔选项字母（如A,B,C）。';
                        } else if (q.type === '2') {
                            prompt += '这是一道判断题，请判断对错，只回答"正确"或"错误"。';
                        } else if (q.type === '3') {
                            prompt += '这是一道填空题，请填写答案，只给出答案内容，不要包含其他说明。';
                        } else if (q.type === '4') {
                            prompt += '这是一道简答题，请简要回答，答案要准确完整。';
                        }

                        const answer = await aiAnswerManager.callAI(
                            prompt,
                            config.aiConfig.baseUrl,
                            config.aiConfig.apiKey,
                            config.aiConfig.model
                        );

                        if (answer) {
                            // 根据题目类型处理答案
                            let processedAnswer = answer.trim();
                            
                            if (q.type === '0') {
                                // 单选题：提取单个字母
                                const match = processedAnswer.toUpperCase().match(/[A-Z]/);
                                processedAnswer = match ? match[0] : processedAnswer.charAt(0).toUpperCase();
                            } else if (q.type === '1') {
                                // 多选题：提取多个字母
                                const matches = processedAnswer.toUpperCase().match(/[A-Z]/g);
                                processedAnswer = matches ? matches.join(',') : processedAnswer;
                            } else if (q.type === '2') {
                                // 判断题：转换为"对"或"错"
                                processedAnswer = (processedAnswer.includes('正确') || processedAnswer.includes('对')) ? '对' : '错';
                            }

                            // 更新答案数据库（同时更新id和questionId）
                            if (answerDB[q.id]) {
                                answerDB[q.id].answer = processedAnswer;
                                successCount++;
                                utils.log(`AI分析成功 [${q.id}]: ${processedAnswer}`);
                            }
                            if (q.questionId && q.questionId !== q.id && answerDB[q.questionId]) {
                                answerDB[q.questionId].answer = processedAnswer;
                            }
                        }
                    } catch (error) {
                        utils.log(`AI分析失败 [${q.id}]: ${error.message}`);
                    }
                });

                // 等待当前批次完成
                await Promise.all(analysisPromises);
                
                // 批次间稍作延迟，避免请求过快
                if (i + batchSize < questionsToAnalyze.length) {
                    await utils.sleep(1000); // 增加延迟，避免API限流
                }
            }

            if (successCount > 0) {
                utils.log(`AI批量分析完成，成功分析 ${successCount} 道题目`);
                this.saveToStorage();
            }

            return successCount;
        }
    };

    // 答题控制器
    const answerController = {
        // 回答单选题
        answerDanxuan: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            if (!questionId) return false;

            // 检查是否已答题，如果配置为跳过已答题且题目已答，则跳过
            if (config.skipAnsweredQuestions && utils.isQuestionAnswered(questionItem)) {
                utils.log('题目已答，跳过:', questionId);
                return false;
            }

            let answerData = answerDBManager.getAnswer(questionId);
            
            // 如果答案库中没有答案，尝试使用AI
            if ((!answerData || !answerData.answer) && config.aiConfig.enabled && controlPanel.isRunning) {
                const questionText = utils.getQuestionText(questionItem);
                // 获取选项
                const options = Array.from(questionItem.querySelectorAll('.question-option-item')).map(opt => {
                    const text = opt.textContent.trim();
                    return text.replace(/^[A-Z]、/, '').trim();
                });
                
                const aiAnswer = await aiAnswerManager.answerWithAI(questionItem, '0', questionText, options);
                if (aiAnswer) {
                    // 提取选项字母（如 "A" 或 "答案是A" -> "A"）
                    const answerMatch = aiAnswer.toUpperCase().match(/[A-Z]/);
                    const answer = answerMatch ? answerMatch[0] : aiAnswer.trim().toUpperCase().charAt(0);
                    answerData = {
                        type: '0',
                        answer: answer
                    };
                    utils.log('使用AI答案:', answer);
                }
            }
            
            if (!answerData || !answerData.answer) {
                utils.log('未找到题目答案:', questionId);
                return false;
            }

            let answer = answerData.answer;
            
            // 处理数组格式的答案，如 ["D"] 转换为 "D"
            if (Array.isArray(answer)) {
                answer = answer.length > 0 ? String(answer[0]) : '';
            }
            
            answer = String(answer).trim().toUpperCase();
            const radio = questionItem.querySelector(`input[type="radio"][value="${answer}"]`);
            
            if (radio) {
                radio.click();
                utils.log(`单选题已选择: ${answer}`);
                // 记录答题过程
                const questionText = utils.getQuestionText(questionItem);
                answerRecordManager.updateRecord(questionId, answer, questionText, '0');
                return true;
            } else {
                utils.log(`单选题选项未找到: ${answer}`);
                return false;
            }
        },

        // 回答多选题
        answerDuoxuan: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            if (!questionId) return false;

            // 检查是否已答题
            if (config.skipAnsweredQuestions && utils.isQuestionAnswered(questionItem)) {
                utils.log('题目已答，跳过:', questionId);
                return false;
            }

            let answerData = answerDBManager.getAnswer(questionId);
            
            // 如果答案库中没有答案，尝试使用AI
            if ((!answerData || !answerData.answer) && config.aiConfig.enabled && controlPanel.isRunning) {
                const questionText = utils.getQuestionText(questionItem);
                const options = Array.from(questionItem.querySelectorAll('.question-option-item')).map(opt => {
                    const text = opt.textContent.trim();
                    return text.replace(/^[A-Z]、/, '').trim();
                });
                
                const aiAnswer = await aiAnswerManager.answerWithAI(questionItem, '1', questionText, options);
                if (aiAnswer) {
                    // 解析AI答案（可能是 "A,B,C" 或 "ABC" 格式）
                    const answers = aiAnswer.toUpperCase().replace(/[,，\s]/g, '').split('').filter(a => /[A-Z]/.test(a));
                    answerData = {
                        type: '1',
                        answer: answers
                    };
                    utils.log('使用AI答案:', answers.join(','));
                }
            }
            
            if (!answerData || !answerData.answer) {
                utils.log('未找到题目答案:', questionId);
                return false;
            }

            let answers = [];
            
            // 处理数组格式的答案，如 ["A", "B", "C", "D"]
            if (Array.isArray(answerData.answer)) {
                answers = answerData.answer.map(a => String(a).trim().toUpperCase()).filter(a => a);
            } else {
                // 处理字符串格式的答案，如 "ABC" 或 "A,B,C"
                const answerStr = String(answerData.answer);
                answers = answerStr.toUpperCase().replace(/[,，\s]/g, '').split('').filter(a => a);
            }
            
            // 将答案数组转换为字符串格式（网站代码期望字符串）
            const answerString = answers.join('');
            
            // 尝试找到并设置 Vue 数据（如果页面使用 Vue）
            // 查找可能的 Vue 实例
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
                    // 尝试多种可能的数据路径
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
            for (const answer of answers) {
                const checkbox = questionItem.querySelector(`input[type="checkbox"][value="${answer}"]`);
                if (checkbox && !checkbox.checked) {
                    // 先设置 checked 属性
                    checkbox.checked = true;
                    // 触发 change 事件
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    // 然后点击
                    checkbox.click();
                    await utils.sleep(100); // 延迟，让网站代码处理
                    utils.log(`多选题已选择: ${answer}`);
                }
            }
            
            if (answers.length > 0) {
                // 记录答题过程
                const questionText = utils.getQuestionText(questionItem);
                answerRecordManager.updateRecord(questionId, answers.join(','), questionText, '1');
            }
            
            return answers.length > 0;
        },

        // 回答判断题
        answerPanduan: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            if (!questionId) return false;

            // 检查是否已答题
            if (config.skipAnsweredQuestions && utils.isQuestionAnswered(questionItem)) {
                utils.log('题目已答，跳过:', questionId);
                return false;
            }

            let answerData = answerDBManager.getAnswer(questionId);
            
            // 如果答案库中没有答案，尝试使用AI
            if ((!answerData || !answerData.answer) && config.aiConfig.enabled && controlPanel.isRunning) {
                const questionText = utils.getQuestionText(questionItem);
                const aiAnswer = await aiAnswerManager.answerWithAI(questionItem, '2', questionText, []);
                if (aiAnswer) {
                    // 判断AI答案是"正确"还是"错误"
                    const answer = aiAnswer.includes('正确') || aiAnswer.includes('对') ? '对' : '错';
                    answerData = {
                        type: '2',
                        answer: answer
                    };
                    utils.log('使用AI答案:', answer);
                }
            }
            
            if (!answerData || !answerData.answer) {
                utils.log('未找到题目答案:', questionId);
                return false;
            }

            let answer = answerData.answer.trim();
            
            // 转换答案格式：将"正确"/"错误"转换为"对"/"错"
            const answerMap = {
                '正确': '对',
                '错误': '错',
                'true': '对',
                'false': '错',
                'True': '对',
                'False': '错'
            };
            
            if (answerMap[answer]) {
                answer = answerMap[answer];
            }
            
            // 先尝试转换后的答案
            let radio = questionItem.querySelector(`input[type="radio"][value="${answer}"]`);
            
            // 如果找不到，尝试原始答案
            if (!radio) {
                radio = questionItem.querySelector(`input[type="radio"][value="${answerData.answer.trim()}"]`);
            }
            
            if (radio) {
                radio.click();
                utils.log(`判断题已选择: ${answer}`);
                // 记录答题过程
                const questionText = utils.getQuestionText(questionItem);
                answerRecordManager.updateRecord(questionId, answer, questionText, '2');
                return true;
            } else {
                utils.log(`判断题选项未找到: ${answer} (原始: ${answerData.answer.trim()})`);
                return false;
            }
        },

        // 回答填空题
        answerTiankong: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            if (!questionId) return false;

            // 检查是否已答题
            if (config.skipAnsweredQuestions && utils.isQuestionAnswered(questionItem)) {
                utils.log('题目已答，跳过:', questionId);
                return false;
            }

            let answerData = answerDBManager.getAnswer(questionId);
            
            // 如果答案库中没有答案，尝试使用AI
            if ((!answerData || !answerData.answer) && config.aiConfig.enabled && controlPanel.isRunning) {
                const questionText = utils.getQuestionText(questionItem);
                const aiAnswer = await aiAnswerManager.answerWithAI(questionItem, '3', questionText, []);
                if (aiAnswer) {
                    answerData = {
                        type: '3',
                        answer: aiAnswer.trim()
                    };
                    utils.log('使用AI答案:', aiAnswer);
                }
            }
            
            if (!answerData || !answerData.answer) {
                utils.log('未找到题目答案:', questionId);
                return false;
            }

            const inputs = questionItem.querySelectorAll('input.tk_input[data-questionid]');
            if (inputs.length === 0) {
                utils.log('未找到填空题输入框');
                return false;
            }

            // 如果有多个空，答案可能是用分隔符分开的
            const answers = answerData.answer.split(/[，,；;]/);
            
            inputs.forEach((input, index) => {
                const answer = answers[index] || answers[0] || answerData.answer;
                input.value = answer.trim();
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                utils.log(`填空题已填写: ${answer.trim()}`);
            });

            // 记录答题过程
            const questionText = utils.getQuestionText(questionItem);
            answerRecordManager.updateRecord(questionId, answerData.answer, questionText, '3');

            return true;
        },

        // 回答简答题
        answerJianda: async function(questionItem) {
            const questionId = utils.getQuestionId(questionItem);
            if (!questionId) return false;

            // 检查是否已答题
            if (config.skipAnsweredQuestions && utils.isQuestionAnswered(questionItem)) {
                utils.log('题目已答，跳过:', questionId);
                return false;
            }

            let answerData = answerDBManager.getAnswer(questionId);
            
            // 如果答案库中没有答案，尝试使用AI
            if ((!answerData || !answerData.answer) && config.aiConfig.enabled && controlPanel.isRunning) {
                const questionText = utils.getQuestionText(questionItem);
                const aiAnswer = await aiAnswerManager.answerWithAI(questionItem, '4', questionText, []);
                if (aiAnswer) {
                    // 清理markdown代码块标记，只保留内容
                    const cleanedAnswer = utils.cleanMarkdownCodeBlocks(aiAnswer);
                    answerData = {
                        type: '4',
                        answer: cleanedAnswer.trim()
                    };
                    utils.log('使用AI答案:', cleanedAnswer.substring(0, 50) + '...');
                }
            }
            
            if (!answerData || !answerData.answer) {
                utils.log('未找到题目答案:', questionId);
                return false;
            }

            // 等待一小段时间，确保编辑器已初始化
            await new Promise(resolve => setTimeout(resolve, 100));

            // 简答题使用富文本编辑器（kindeditor），尝试多种方式填写
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
                            const formattedAnswer = answerData.answer.replace(/\n/g, '<br>');
                            editor.html(formattedAnswer);
                            // 触发change事件并同步
                            editor.sync();
                            // 等待一小段时间确保内容被保存
                            await new Promise(resolve => setTimeout(resolve, 200));
                            utils.log('简答题已填写（通过kindeditor API）');
                            // 记录答题过程
                            const questionText = utils.getQuestionText(questionItem);
                            answerRecordManager.updateRecord(questionId, answerData.answer, questionText, '4');
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
                        const formattedAnswer = answerData.answer.replace(/\n/g, '<br>');
                        
                        // 直接修改body的内容（用户测试发现这样可以成功）
                        iframeBody.innerHTML = formattedAnswer;
                        
                        // 在iframe的document上触发input事件（重要！）
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
                            // 将HTML转换为纯文本用于textarea
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = formattedAnswer;
                            const plainText = tempDiv.textContent || tempDiv.innerText || answerData.answer;
                            textarea.value = plainText;
                            // 触发textarea的事件
                            ['input', 'change'].forEach(eventType => {
                                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 尝试触发kindeditor的同步机制和父元素事件
                        const keContainer = editorBox.querySelector('.ke-container');
                        if (keContainer) {
                            // 触发可能需要的同步事件
                            ['sync', 'change'].forEach(eventType => {
                                keContainer.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        // 在editorBox及其父元素上触发事件（可能监听了"爷爷辈改变"）
                        let parent = editorBox;
                        for (let i = 0; i < 3 && parent; i++) {
                            ['input', 'change'].forEach(eventType => {
                                parent.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                            parent = parent.parentElement;
                        }
                        
                        // 等待一小段时间确保内容被保存
                        await new Promise(resolve => setTimeout(resolve, 300));
                        utils.log('简答题已填写（通过iframe）');
                        // 记录答题过程
                        const questionText = utils.getQuestionText(questionItem);
                        answerRecordManager.updateRecord(questionId, answerData.answer, questionText, '4');
                        return true;
                    }
                } catch (e) {
                    utils.log('无法访问iframe编辑器:', e);
                }
            }

            // 方法3: 尝试查找并操作 textarea（作为备选方案）
            const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
            if (textarea) {
                // 保留原始答案，包括换行符
                textarea.value = answerData.answer;
                // 触发多种事件以确保编辑器更新
                ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                    textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                });
                // 如果textarea是隐藏的，尝试显示并同步
                if (textarea.style.display === 'none') {
                    // kindeditor可能使用隐藏的textarea，尝试同步
                    const keContainer = editorBox.querySelector('.ke-container');
                    if (keContainer) {
                        // 尝试触发同步
                        const syncEvent = new Event('sync', { bubbles: true });
                        keContainer.dispatchEvent(syncEvent);
                    }
                }
                // 等待一小段时间确保内容被保存
                await new Promise(resolve => setTimeout(resolve, 200));
                utils.log('简答题已填写（通过textarea）');
                // 记录答题过程
                const questionText = utils.getQuestionText(questionItem);
                answerRecordManager.updateRecord(questionId, answerData.answer, questionText, '4');
                return true;
            }
            
            // 方法4: 尝试查找其他可能的编辑器元素
            const contentEditable = editorBox.querySelector('[contenteditable="true"]');
            if (contentEditable) {
                const formattedAnswer = answerData.answer.replace(/\n/g, '<br>');
                contentEditable.innerHTML = formattedAnswer;
                ['input', 'change', 'blur'].forEach(eventType => {
                    contentEditable.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                });
                // 等待一小段时间确保内容被保存
                await new Promise(resolve => setTimeout(resolve, 200));
                utils.log('简答题已填写（通过contentEditable）');
                // 记录答题过程
                const questionText = utils.getQuestionText(questionItem);
                answerRecordManager.updateRecord(questionId, answerData.answer, questionText, '4');
                return true;
            }

            utils.log('简答题填写失败：未找到可用的编辑器元素');
            return false;
        },

        // 自动答题主函数
        autoAnswer: async function() {
            if (!config.autoAnswer) {
                return;
            }

            utils.log('开始自动答题...');

            let answeredCount = 0;

            // 处理单选题
            const danxuanItems = document.querySelectorAll('#danxuanQuestionBox .questionItem');
            for (const item of danxuanItems) {
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                if (await this.answerDanxuan(item)) {
                    answeredCount++;
                }
                await utils.sleep(config.answerDelay);
            }

            // 处理多选题
            const duoxuanItems = document.querySelectorAll('#duoxuanQuestionBox .questionItem');
            for (const item of duoxuanItems) {
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                if (await this.answerDuoxuan(item)) {
                    answeredCount++;
                }
                await utils.sleep(config.answerDelay);
            }

            // 处理判断题
            const panduanItems = document.querySelectorAll('#panduanQuestionBox .questionItem');
            for (const item of panduanItems) {
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                if (await this.answerPanduan(item)) {
                    answeredCount++;
                }
                await utils.sleep(config.answerDelay);
            }

            // 处理填空题
            const tiankongItems = document.querySelectorAll('#tiankongQuestionBox .questionItem');
            for (const item of tiankongItems) {
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                if (await this.answerTiankong(item)) {
                    answeredCount++;
                }
                await utils.sleep(config.answerDelay);
            }

            // 处理简答题
            const jiandaItems = document.querySelectorAll('#jiandaQuestionBox .questionItem');
            for (const item of jiandaItems) {
                if (!controlPanel.isRunning) {
                    utils.log('答题已停止');
                    return;
                }
                if (await this.answerJianda(item)) {
                    answeredCount++;
                }
                await utils.sleep(config.answerDelay);
            }

            if (controlPanel.isRunning) {
                utils.log(`自动答题完成，共回答 ${answeredCount} 道题目`);
            }

            // 自动提交
            if (config.autoSubmit) {
                setTimeout(() => {
                    const submitBtn = document.querySelector('.subBtn .submit button');
                    if (submitBtn) {
                        if (confirm('是否自动提交作业？')) {
                            submitBtn.click();
                        }
                    }
                }, 2000);
            }
        }
    };

    // API模板配置（全局定义，供多个函数使用）
    const apiTemplates = {
        'deepseek': {
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            description: 'DeepSeek 官方 API',
            // 支持的模型：deepseek-chat（非思考模式）、deepseek-reasoner（思考模式）
            supportedModels: ['deepseek-chat', 'deepseek-reasoner']
        },
        'modelscope': {
            baseUrl: 'https://api-inference.modelscope.cn/v1',
            model: 'deepseek-ai/DeepSeek-V3.2-Exp',
            description: '魔搭 ModelScope（支持多种模型）'
        },
        'openai': {
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-3.5-turbo',
            description: 'OpenAI 官方 API'
        },
        'custom': {
            baseUrl: '',
            model: '',
            description: '自定义配置'
        }
    };

    // 控制面板
    const controlPanel = {
        currentTab: 'control', // 当前选中的tab
        isRunning: false, // 是否正在运行
        
        create: function() {
            if (!config.showControlPanel) {
                return;
            }

            const panel = document.createElement('div');
            panel.id = 'autoAnswerPanel';
            panel.innerHTML = `
                <div style="position: fixed; top: 10px; right: 10px; z-index: 99999; background: #fff; border: 2px solid #409EFF; border-radius: 8px; padding: 0; box-shadow: 0 2px 12px rgba(0,0,0,0.1); font-family: Arial, sans-serif; width: 450px; height: 600px; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="font-weight: bold; padding: 12px 15px; color: #409EFF; font-size: 16px; cursor: move; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                        <span>自动答题控制面板</span>
                        <div id="headerScoreInfo" style="font-size: 12px; font-weight: normal;">
                            <!-- 分数信息将在这里显示 -->
                        </div>
                    </div>
                    
                    <!-- Tab 导航 -->
                    <div style="display: flex; border-bottom: 1px solid #eee;">
                        <div id="tabControl" class="tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; border-bottom: 2px solid #409EFF; color: #409EFF; font-weight: bold;">控制</div>
                        <div id="tabAI" class="tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #909399;">AI答题</div>
                        <div id="tabRecord" class="tab-item" style="flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #909399;">答题记录</div>
                    </div>
                    
                    <!-- Tab 内容区域 -->
                    <div style="padding: 15px; flex: 1; overflow-y: auto;">
                        <!-- 控制 Tab -->
                        <div id="tabContentControl" class="tab-content">
                            <div style="margin-bottom: 10px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="autoAnswerCheck" ${config.autoAnswer ? 'checked' : ''} style="margin-right: 8px;">
                                    <span>自动答题</span>
                                </label>
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="autoSubmitCheck" ${config.autoSubmit ? 'checked' : ''} style="margin-right: 8px;">
                                    <span>自动提交</span>
                                </label>
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="skipAnsweredCheck" ${config.skipAnsweredQuestions ? 'checked' : ''} style="margin-right: 8px;">
                                    <span>跳过已答题</span>
                                </label>
                                <div style="font-size: 11px; color: #909399; margin-left: 24px; margin-top: 4px;">
                                    开启后，已答题的题目将被跳过；关闭后，将重新答题
                                </div>
                            </div>
                            <div style="margin-bottom: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                <button id="startAnswerBtn" style="width: 100%; padding: 8px; background: #409EFF; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-bottom: 8px;">开始自动答题</button>
                                <button id="stopAnswerBtn" style="width: 100%; padding: 8px; background: #f56c6c; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">停止答题</button>
                            </div>
                            <div style="margin-top: 10px; font-size: 12px; color: #909399;">
                                <div>状态: <span id="statusText">等待开始</span></div>
                                <div style="margin-top: 5px;">答案库: <span id="answerCount">0</span> 道题目</div>
                            </div>
                            
                            <!-- 分数统计区域 -->
                            <div id="scoreInfo" style="margin-top: 15px;">
                                <!-- 分数信息将在这里动态显示 -->
                            </div>
                            
                            <!-- 答题日志区域 -->
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div style="font-size: 13px; font-weight: bold; color: #303133;">答题日志</div>
                                    <div style="display: flex; gap: 5px;">
                                        <button id="copyLogBtn" style="padding: 2px 8px; background: #409EFF; color: #fff; border: 1px solid #409EFF; border-radius: 3px; cursor: pointer; font-size: 11px;">复制</button>
                                        <button id="clearLogBtn" style="padding: 2px 8px; background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6; border-radius: 3px; cursor: pointer; font-size: 11px;">清空</button>
                                    </div>
                                </div>
                                <div id="logContainer" style="background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; max-height: 200px; overflow-y: auto; font-size: 11px; font-family: 'Courier New', monospace;">
                                    <div style="color: #909399; text-align: center; padding: 10px;">暂无日志</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- AI答题 Tab -->
                        <div id="tabContentAI" class="tab-content" style="display: none;">
                            <div style="margin-bottom: 15px;">
                                <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #303133;">AI配置：</h4>
                                
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">API 模板：</label>
                                    <select id="aiTemplate" style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box; background: #fff; cursor: pointer;">
                                        <option value="custom">自定义配置</option>
                                        <option value="deepseek">DeepSeek 官方 API</option>
                                        <option value="modelscope">魔搭 ModelScope</option>
                                        <option value="openai">OpenAI 官方 API</option>
                                    </select>
                                    <div style="margin-top: 4px; font-size: 11px; color: #909399;">
                                        选择预设模板可快速配置，或选择"自定义配置"手动输入
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">Base URL：</label>
                                    <input type="text" id="aiBaseUrl" placeholder="https://api.openai.com/v1 或 https://api-inference.modelscope.cn/v1"
                                        style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                    <div style="margin-top: 4px; font-size: 11px; color: #909399;">
                                        支持 OpenAI、ModelScope、DeepSeek 等兼容接口
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">API Key / Token：</label>
                                    <input type="password" id="aiApiKey" placeholder="sk-... 或 ms-..." 
                                        style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                    <div style="margin-top: 4px; font-size: 11px; color: #909399;">
                                        <label style="display: flex; align-items: center; cursor: pointer;">
                                            <input type="checkbox" id="showApiKey" style="margin-right: 4px;">
                                            <span>显示密钥</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; font-size: 12px; color: #606266; margin-bottom: 5px;">模型名称：</label>
                                    <input type="text" id="aiModel" placeholder="deepseek-chat / deepseek-reasoner / gpt-3.5-turbo / ZhipuAI/GLM-4.6" 
                                        style="width: 100%; padding: 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                    <div style="margin-top: 4px; font-size: 11px; color: #909399;">
                                        DeepSeek: deepseek-chat（非思考模式）或 deepseek-reasoner（思考模式）
                                    </div>
                                </div>
                                
                                <!-- 高级配置（可折叠） -->
                                <div style="margin-bottom: 12px;">
                                    <details style="cursor: pointer;">
                                        <summary style="font-size: 12px; color: #606266; padding: 5px 0; user-select: none;">高级配置（点击展开）</summary>
                                        <div style="margin-top: 10px; padding: 10px; background: #f5f7fa; border-radius: 4px;">
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: block; font-size: 11px; color: #606266; margin-bottom: 3px;">Temperature（温度）:</label>
                                                <input type="number" id="aiTemperature" step="0.1" min="0" max="2" 
                                                    style="width: 100%; padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px;">控制随机性，0-2之间，默认0.3</div>
                                            </div>
                                            
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: block; font-size: 11px; color: #606266; margin-bottom: 3px;">Max Tokens（最大令牌数）:</label>
                                                <input type="number" id="aiMaxTokens" min="100" max="8000" 
                                                    style="width: 100%; padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px;">限制响应长度，建议1500-3000</div>
                                            </div>
                                            
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: block; font-size: 11px; color: #606266; margin-bottom: 3px;">Top P（核采样）:</label>
                                                <input type="number" id="aiTopP" step="0.1" min="0" max="1" 
                                                    style="width: 100%; padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px;">控制多样性，0-1之间，默认1.0</div>
                                            </div>
                                            
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: block; font-size: 11px; color: #606266; margin-bottom: 3px;">Frequency Penalty（频率惩罚）:</label>
                                                <input type="number" id="aiFrequencyPenalty" step="0.1" min="-2" max="2" 
                                                    style="width: 100%; padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px;">减少重复，-2到2之间，默认0.0</div>
                                            </div>
                                            
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: block; font-size: 11px; color: #606266; margin-bottom: 3px;">Presence Penalty（存在惩罚）:</label>
                                                <input type="number" id="aiPresencePenalty" step="0.1" min="-2" max="2" 
                                                    style="width: 100%; padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px;">鼓励新话题，-2到2之间，默认0.0</div>
                                            </div>
                                            
                                            <div style="margin-bottom: 10px;">
                                                <label style="display: flex; align-items: center; cursor: pointer;">
                                                    <input type="checkbox" id="aiStream" style="margin-right: 6px;">
                                                    <span style="font-size: 11px;">启用流式响应（Stream）</span>
                                                </label>
                                                <div style="font-size: 10px; color: #909399; margin-top: 2px; margin-left: 20px;">
                                                    启用后可以看到AI的推理过程和实时答案（适用于支持流式的模型）
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                                
                                <div style="margin-bottom: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" id="aiEnabled" style="margin-right: 8px;">
                                        <span style="font-size: 13px; font-weight: bold;">启用AI答题</span>
                                    </label>
                                    <div style="margin-top: 8px; font-size: 11px; color: #909399; line-height: 1.5;">
                                        启用后，当答案库中没有答案时，将自动调用AI进行答题
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 10px;">
                                    <button id="saveAIConfigBtn" style="width: 100%; padding: 10px; background: #409EFF; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; margin-bottom: 8px;">保存配置</button>
                                    <button id="testAIBtn" style="width: 100%; padding: 8px; background: #67C23A; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">测试AI连接</button>
                                </div>
                                
                                <div style="font-size: 12px; color: #909399; margin-top: 10px;">
                                    <div>AI状态: <span id="aiStatus" style="color: #E6A23C;">未配置</span></div>
                                    <div style="margin-top: 5px; font-size: 11px; line-height: 1.5;">
                                        支持OpenAI API、Claude API等兼容接口
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 答题记录 Tab -->
                        <div id="tabContentRecord" class="tab-content" style="display: none;">
                            <div style="margin-bottom: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <h4 style="margin: 0; font-size: 14px; color: #303133;">答题记录</h4>
                                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                        <button id="importAnswerBtn" style="padding: 5px 10px; background: #909399; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导入答案</button>
                                        <button id="exportRecordJsonBtn" style="padding: 5px 10px; background: #67C23A; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导出JSON</button>
                                        <button id="exportRecordTxtBtn" style="padding: 5px 10px; background: #409EFF; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导出TXT</button>
                                        <button id="exportRecordCsvBtn" style="padding: 5px 10px; background: #E6A23C; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">导出CSV</button>
                                        <button id="clearRecordBtn" style="padding: 5px 10px; background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6; border-radius: 4px; cursor: pointer; font-size: 12px;">清空</button>
                                    </div>
                                </div>
                                <input type="file" id="importAnswerFile" accept=".json" style="display: none;">
                                <div style="font-size: 12px; color: #909399; margin-bottom: 10px;">
                                    共 <span id="recordCount">0</span> 道题目
                                </div>
                                <div id="answerRecordContainer" style="background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px; padding: 10px; min-height: 200px;">
                                    <div style="color: #909399; text-align: center; padding: 20px;">暂无答题记录</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);

            // Tab 切换功能
            document.getElementById('tabControl').addEventListener('click', () => {
                this.switchTab('control');
            });

            document.getElementById('tabAI').addEventListener('click', () => {
                this.switchTab('ai');
            });

            document.getElementById('tabRecord').addEventListener('click', () => {
                this.switchTab('record');
            });

            // 答题记录相关事件
            document.getElementById('importAnswerBtn').addEventListener('click', () => {
                document.getElementById('importAnswerFile').click();
            });

            document.getElementById('importAnswerFile').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const jsonData = JSON.parse(event.target.result);
                        answerRecordManager.importAnswers(jsonData);
                    } catch (error) {
                        alert('导入失败：JSON格式错误\n' + error.message);
                        utils.log('导入答案失败:', error);
                    }
                };
                reader.readAsText(file);
                // 清空文件选择，以便可以重复选择同一文件
                e.target.value = '';
            });

            document.getElementById('exportRecordJsonBtn').addEventListener('click', () => {
                answerRecordManager.export('json');
            });

            document.getElementById('exportRecordTxtBtn').addEventListener('click', () => {
                answerRecordManager.export('txt');
            });

            document.getElementById('exportRecordCsvBtn').addEventListener('click', () => {
                answerRecordManager.export('csv');
            });

            document.getElementById('clearRecordBtn').addEventListener('click', () => {
                if (confirm('确定要清空所有答题记录吗？')) {
                    answerRecordManager.clear();
                }
            });

            // 绑定事件
            document.getElementById('autoAnswerCheck').addEventListener('change', (e) => {
                config.autoAnswer = e.target.checked;
            });

            document.getElementById('autoSubmitCheck').addEventListener('change', (e) => {
                config.autoSubmit = e.target.checked;
            });

            document.getElementById('skipAnsweredCheck').addEventListener('change', (e) => {
                config.skipAnsweredQuestions = e.target.checked;
            });

            document.getElementById('startAnswerBtn').addEventListener('click', () => {
                this.start();
            });

            document.getElementById('stopAnswerBtn').addEventListener('click', () => {
                this.stop();
            });

            document.getElementById('clearLogBtn').addEventListener('click', () => {
                this.clearLogs();
            });

            document.getElementById('copyLogBtn').addEventListener('click', () => {
                this.copyLogs();
            });

            // AI配置相关事件
            document.getElementById('saveAIConfigBtn').addEventListener('click', () => {
                this.saveAIConfig();
            });

            document.getElementById('testAIBtn').addEventListener('click', () => {
                this.testAIConnection();
            });

            document.getElementById('showApiKey').addEventListener('change', (e) => {
                const apiKeyInput = document.getElementById('aiApiKey');
                apiKeyInput.type = e.target.checked ? 'text' : 'password';
            });

            // 模板选择事件
            document.getElementById('aiTemplate').addEventListener('change', (e) => {
                const templateId = e.target.value;
                const template = apiTemplates[templateId];
                
                if (template && templateId !== 'custom') {
                    // 自动填充Base URL和Model
                    const baseUrlInput = document.getElementById('aiBaseUrl');
                    const modelInput = document.getElementById('aiModel');
                    
                    if (baseUrlInput) {
                        baseUrlInput.value = template.baseUrl;
                    }
                    if (modelInput) {
                        const currentModel = modelInput.value.trim();
                        // 对于 DeepSeek，如果当前模型已经是支持的模型之一，保留它
                        if (templateId === 'deepseek' && template.supportedModels && template.supportedModels.includes(currentModel)) {
                            // 保留当前模型（如 deepseek-reasoner）
                            utils.log(`保留当前 DeepSeek 模型: ${currentModel}`);
                        } else {
                            // 否则使用模板默认模型
                            modelInput.value = template.model;
                        }
                    }
                    
                    // 触发自动保存
                    autoSaveConfig();
                    
                    const finalModel = modelInput ? modelInput.value : template.model;
                    utils.log(`已切换到模板: ${template.description}，Base URL: ${template.baseUrl}，Model: ${finalModel}`);
                }
            });

            // 输入框值改变时自动保存（延迟保存，避免频繁写入）
            let saveTimer = null;
            const autoSaveConfig = () => {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    const baseUrl = document.getElementById('aiBaseUrl').value.trim();
                    const apiKey = document.getElementById('aiApiKey').value.trim();
                    const model = document.getElementById('aiModel').value.trim();
                    const enabled = document.getElementById('aiEnabled').checked;
                    const temperature = parseFloat(document.getElementById('aiTemperature')?.value) || 0.3;
                    const maxTokens = parseInt(document.getElementById('aiMaxTokens')?.value) || 1500;
                    const topP = parseFloat(document.getElementById('aiTopP')?.value);
                    const frequencyPenalty = parseFloat(document.getElementById('aiFrequencyPenalty')?.value);
                    const presencePenalty = parseFloat(document.getElementById('aiPresencePenalty')?.value);
                    const stream = document.getElementById('aiStream')?.checked || false;
                    const template = document.getElementById('aiTemplate')?.value || 'custom';
                    
                    if (baseUrl && apiKey) {
                        const cleanBaseUrl = baseUrl.replace('/chat/completions', '').replace(/\/$/, '');
                        config.aiConfig = {
                            enabled: enabled,
                            baseUrl: cleanBaseUrl,
                            apiKey: apiKey,
                            model: model || 'gpt-3.5-turbo',
                            temperature: temperature,
                            maxTokens: maxTokens,
                            stream: stream,
                            topP: isNaN(topP) ? 1.0 : topP,
                            frequencyPenalty: isNaN(frequencyPenalty) ? 0.0 : frequencyPenalty,
                            presencePenalty: isNaN(presencePenalty) ? 0.0 : presencePenalty,
                            template: template, // 保存模板选择
                            autoFetchQuestions: config.aiConfig.autoFetchQuestions !== false,
                            autoAnalyzeWithAI: config.aiConfig.autoAnalyzeWithAI !== false
                        };
                        GM_setValue('aiConfig', config.aiConfig);
                        this.updateAIStatus();
                    }
                }, 1000); // 1秒后自动保存
            };

            document.getElementById('aiBaseUrl').addEventListener('input', autoSaveConfig);
            document.getElementById('aiApiKey').addEventListener('input', autoSaveConfig);
            document.getElementById('aiModel').addEventListener('input', autoSaveConfig);
            document.getElementById('aiEnabled').addEventListener('change', autoSaveConfig);
            
            // 高级配置的自动保存
            const advancedInputs = ['aiTemperature', 'aiMaxTokens', 'aiTopP', 'aiFrequencyPenalty', 'aiPresencePenalty', 'aiStream'];
            advancedInputs.forEach(inputId => {
                const input = document.getElementById(inputId);
                if (input) {
                    if (input.type === 'checkbox') {
                        input.addEventListener('change', autoSaveConfig);
                    } else {
                        input.addEventListener('input', autoSaveConfig);
                    }
                }
            });

            // 加载AI配置（从浏览器存储中恢复）
            this.loadAIConfig();

            // 确保所有输入框支持粘贴
            const allInputs = panel.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], textarea');
            allInputs.forEach(input => {
                // 确保输入框可以正常使用
                input.style.userSelect = 'text';
                input.style.webkitUserSelect = 'text';
                input.style.MozUserSelect = 'text';
                
                // 确保粘贴事件不被阻止
                input.addEventListener('paste', (e) => {
                    // 允许粘贴，不做任何阻止
                }, true);
                
                // 确保右键菜单可用（包含粘贴选项）
                input.addEventListener('contextmenu', (e) => {
                    // 允许右键菜单
                }, true);
            });

            // 拖拽功能
            this.makeDraggable(panel);

            // 更新答案数量
            this.updateAnswerCount();
            
            // 初始化日志显示
            this.updateLogs();
        },

        switchTab: function(tabName) {
            this.currentTab = tabName;
            
            // 更新 Tab 样式
            const tabControl = document.getElementById('tabControl');
            const tabAI = document.getElementById('tabAI');
            const tabRecord = document.getElementById('tabRecord');
            const contentControl = document.getElementById('tabContentControl');
            const contentAI = document.getElementById('tabContentAI');
            const contentRecord = document.getElementById('tabContentRecord');
            
            // 重置所有tab样式
            [tabControl, tabAI, tabRecord].forEach(tab => {
                if (tab) {
                    tab.style.borderBottom = 'none';
                    tab.style.color = '#909399';
                    tab.style.fontWeight = 'normal';
                }
            });
            
            [contentControl, contentAI, contentRecord].forEach(content => {
                if (content) {
                    content.style.display = 'none';
                }
            });
            
            // 设置当前tab样式
            if (tabName === 'control') {
                if (tabControl) {
                    tabControl.style.borderBottom = '2px solid #409EFF';
                    tabControl.style.color = '#409EFF';
                    tabControl.style.fontWeight = 'bold';
                }
                if (contentControl) {
                    contentControl.style.display = 'block';
                }
            } else if (tabName === 'ai') {
                if (tabAI) {
                    tabAI.style.borderBottom = '2px solid #409EFF';
                    tabAI.style.color = '#409EFF';
                    tabAI.style.fontWeight = 'bold';
                }
                if (contentAI) {
                    contentAI.style.display = 'block';
                }
            } else if (tabName === 'record') {
                if (tabRecord) {
                    tabRecord.style.borderBottom = '2px solid #409EFF';
                    tabRecord.style.color = '#409EFF';
                    tabRecord.style.fontWeight = 'bold';
                }
                if (contentRecord) {
                    contentRecord.style.display = 'block';
                }
                // 更新答题记录显示
                answerRecordManager.updateUI();
                const recordCount = document.getElementById('recordCount');
                if (recordCount) {
                    recordCount.textContent = answerRecordManager.records.length;
                }
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
                // 如果点击的是输入框、按钮或其他交互元素，不启动拖动
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
                    e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' ||
                    e.target.isContentEditable || e.target.closest('input, textarea, button, select')) {
                    return;
                }
                
                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                    e.preventDefault(); // 防止选中文本
                    
                    // 获取当前元素位置（考虑right属性）
                    const rect = element.getBoundingClientRect();
                    initialX = e.clientX - rect.left;
                    initialY = e.clientY - rect.top;
                    
                    xOffset = rect.left;
                    yOffset = rect.top;
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    
                    // 限制在视口内
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
            const count = Object.keys(answerDB).length;
            const countElement = document.getElementById('answerCount');
            if (countElement) {
                countElement.textContent = count;
            }
        },

        updateStatus: function(text) {
            const statusText = document.getElementById('statusText');
            if (statusText) {
                statusText.textContent = text;
            }
        },

        start: function() {
            this.isRunning = true;
            this.updateStatus('答题中...');
            answerController.autoAnswer().then(() => {
                if (this.isRunning) {
                    this.updateStatus('答题完成');
                }
                this.isRunning = false;
            }).catch(() => {
                this.isRunning = false;
            });
        },

        stop: function() {
            this.isRunning = false;
            this.updateStatus('已停止');
            utils.log('已停止答题');
        },

        updateLogs: function() {
            const logContainer = document.getElementById('logContainer');
            if (!logContainer) return;

            if (answerLogs.length === 0) {
                logContainer.innerHTML = '<div style="color: #909399; text-align: center; padding: 10px;">暂无日志</div>';
                return;
            }

            const logHtml = answerLogs.map(log => {
                // 根据日志内容设置颜色
                let color = '#606266'; // 默认灰色
                if (log.message.includes('成功') || log.message.includes('完成') || log.message.includes('已选择') || log.message.includes('已填写')) {
                    color = '#67C23A'; // 成功绿色
                } else if (log.message.includes('失败') || log.message.includes('错误') || log.message.includes('未找到')) {
                    color = '#F56C6C'; // 错误红色
                } else if (log.message.includes('开始') || log.message.includes('加载')) {
                    color = '#409EFF'; // 信息蓝色
                } else if (log.message.includes('等待')) {
                    color = '#E6A23C'; // 警告橙色
                }

                return `
                    <div style="margin-bottom: 4px; line-height: 1.4;">
                        <span style="color: #909399; font-size: 10px;">[${log.time}]</span>
                        <span style="color: ${color};">${this.escapeHtml(log.message)}</span>
                    </div>
                `;
            }).join('');

            logContainer.innerHTML = logHtml;
            
            // 自动滚动到顶部（最新日志）
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

            // 构建日志文本
            const logText = answerLogs.map(log => {
                return `[${log.time}] ${log.message}`;
            }).join('\n');

            // 复制到剪贴板
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(logText).then(() => {
                    utils.log('日志已复制到剪贴板');
                    // 临时改变按钮文本提示
                    const copyBtn = document.getElementById('copyLogBtn');
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '已复制';
                    copyBtn.style.background = '#67C23A';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = '#409EFF';
                    }, 2000);
                }).catch(err => {
                    utils.log('复制失败:', err);
                    this.fallbackCopyLogs(logText);
                });
            } else {
                // 降级方案：使用传统方法
                this.fallbackCopyLogs(logText);
            }
        },

        fallbackCopyLogs: function(text) {
            // 创建临时文本区域
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    utils.log('日志已复制到剪贴板（降级方案）');
                    const copyBtn = document.getElementById('copyLogBtn');
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '已复制';
                    copyBtn.style.background = '#67C23A';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = '#409EFF';
                    }, 2000);
                } else {
                    alert('复制失败，请手动选择日志内容复制');
                }
            } catch (err) {
                utils.log('复制失败:', err);
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

        loadAIConfig: function() {
            const saved = GM_getValue('aiConfig', null);
            if (saved) {
                config.aiConfig = { ...config.aiConfig, ...saved };
                // 兼容旧版本的 apiUrl 配置
                if (saved.apiUrl && !saved.baseUrl) {
                    config.aiConfig.baseUrl = saved.apiUrl.replace('/chat/completions', '').replace(/\/$/, '');
                }
            }
            
            // 填充输入框
            const baseUrlInput = document.getElementById('aiBaseUrl');
            const apiKeyInput = document.getElementById('aiApiKey');
            const modelInput = document.getElementById('aiModel');
            const enabledCheck = document.getElementById('aiEnabled');
            const temperatureInput = document.getElementById('aiTemperature');
            const maxTokensInput = document.getElementById('aiMaxTokens');
            const topPInput = document.getElementById('aiTopP');
            const frequencyPenaltyInput = document.getElementById('aiFrequencyPenalty');
            const presencePenaltyInput = document.getElementById('aiPresencePenalty');
            const streamCheck = document.getElementById('aiStream');
            const templateSelect = document.getElementById('aiTemplate');
            
            if (baseUrlInput) baseUrlInput.value = config.aiConfig.baseUrl || '';
            if (apiKeyInput) apiKeyInput.value = config.aiConfig.apiKey || '';
            if (modelInput) modelInput.value = config.aiConfig.model || 'gpt-3.5-turbo';
            if (enabledCheck) enabledCheck.checked = config.aiConfig.enabled || false;
            if (temperatureInput) temperatureInput.value = config.aiConfig.temperature !== undefined ? config.aiConfig.temperature : 0.3;
            if (maxTokensInput) maxTokensInput.value = config.aiConfig.maxTokens !== undefined ? config.aiConfig.maxTokens : 1500;
            if (topPInput) topPInput.value = config.aiConfig.topP !== undefined ? config.aiConfig.topP : 1.0;
            if (frequencyPenaltyInput) frequencyPenaltyInput.value = config.aiConfig.frequencyPenalty !== undefined ? config.aiConfig.frequencyPenalty : 0.0;
            if (presencePenaltyInput) presencePenaltyInput.value = config.aiConfig.presencePenalty !== undefined ? config.aiConfig.presencePenalty : 0.0;
            if (streamCheck) streamCheck.checked = config.aiConfig.stream || false;
            
            // 自动识别并选择模板，并验证和修正模型名称
            if (templateSelect) {
                const baseUrl = (config.aiConfig.baseUrl || '').trim();
                const model = (config.aiConfig.model || '').trim();
                let detectedTemplate = 'custom';
                let needFixModel = false;
                let correctModel = model;
                
                // 根据Base URL识别模板并验证模型名称
                // DeepSeek API 支持两种 Base URL 格式：https://api.deepseek.com 或 https://api.deepseek.com/v1
                if (baseUrl.includes('api.deepseek.com')) {
                    detectedTemplate = 'deepseek';
                    // DeepSeek 官方 API 支持的模型：deepseek-chat（非思考模式）、deepseek-reasoner（思考模式）
                    // 如果使用的是魔搭格式的模型名（包含 / 或 DeepSeek-V3），需要修正
                    if (model.includes('/') || (model.includes('DeepSeek-V3') && !model.startsWith('deepseek-'))) {
                        correctModel = 'deepseek-chat';
                        needFixModel = true;
                    }
                    // deepseek-chat 和 deepseek-reasoner 都是有效的，不需要修正
                } else if (baseUrl.includes('api-inference.modelscope.cn')) {
                    detectedTemplate = 'modelscope';
                    // 魔搭应该使用带斜杠的模型名，如果使用的是 deepseek-chat，建议使用魔搭的模型
                    if (model === 'deepseek-chat' || (!model.includes('/') && model !== '')) {
                        correctModel = 'deepseek-ai/DeepSeek-V3.2-Exp';
                        needFixModel = true;
                    }
                } else if (baseUrl.includes('api.openai.com')) {
                    detectedTemplate = 'openai';
                    // OpenAI 应该使用 gpt- 开头的模型名
                    if (model.includes('/') || model.includes('deepseek')) {
                        correctModel = 'gpt-3.5-turbo';
                        needFixModel = true;
                    }
                }
                
                // 如果保存了模板选择，优先使用保存的
                if (config.aiConfig.template) {
                    detectedTemplate = config.aiConfig.template;
                    // 根据选择的模板修正模型名称
                    const template = apiTemplates[detectedTemplate];
                    if (template && detectedTemplate !== 'custom') {
                        if (model !== template.model) {
                            correctModel = template.model;
                            needFixModel = true;
                        }
                    }
                }
                
                templateSelect.value = detectedTemplate;
                
                // 如果模型名称不匹配，自动修正
                if (needFixModel && modelInput) {
                    modelInput.value = correctModel;
                    config.aiConfig.model = correctModel;
                    utils.log(`检测到模型名称不匹配，已自动修正为: ${correctModel}`);
                    // 保存修正后的配置
                    GM_setValue('aiConfig', config.aiConfig);
                }
            }
            
            this.updateAIStatus();
        },

        saveAIConfig: function() {
            const baseUrl = document.getElementById('aiBaseUrl').value.trim();
            const apiKey = document.getElementById('aiApiKey').value.trim();
            const model = document.getElementById('aiModel').value.trim();
            const enabled = document.getElementById('aiEnabled').checked;
            const temperature = parseFloat(document.getElementById('aiTemperature').value) || 0.3;
            const maxTokens = parseInt(document.getElementById('aiMaxTokens').value) || 1500;
            const topP = parseFloat(document.getElementById('aiTopP').value);
            const frequencyPenalty = parseFloat(document.getElementById('aiFrequencyPenalty').value);
            const presencePenalty = parseFloat(document.getElementById('aiPresencePenalty').value);
            const stream = document.getElementById('aiStream').checked;
            const template = document.getElementById('aiTemplate')?.value || 'custom';
            
            if (!baseUrl || !apiKey) {
                alert('请填写Base URL和API Key');
                return;
            }
            
            // 确保 baseUrl 格式正确（移除末尾的 /chat/completions 和斜杠）
            const cleanBaseUrl = baseUrl.replace('/chat/completions', '').replace(/\/$/, '');
            
            config.aiConfig = {
                enabled: enabled,
                baseUrl: cleanBaseUrl,
                apiKey: apiKey,
                model: model || 'gpt-3.5-turbo',
                temperature: temperature,
                maxTokens: maxTokens,
                stream: stream,
                topP: isNaN(topP) ? 1.0 : topP,
                frequencyPenalty: isNaN(frequencyPenalty) ? 0.0 : frequencyPenalty,
                presencePenalty: isNaN(presencePenalty) ? 0.0 : presencePenalty,
                template: template, // 保存模板选择
                autoFetchQuestions: config.aiConfig.autoFetchQuestions !== false,
                autoAnalyzeWithAI: config.aiConfig.autoAnalyzeWithAI !== false
            };
            
            GM_setValue('aiConfig', config.aiConfig);
            this.updateAIStatus();
            utils.log('AI配置已保存');
            alert('AI配置已保存！');
        },

        updateAIStatus: function() {
            const statusElement = document.getElementById('aiStatus');
            if (!statusElement) return;
            
            if (!config.aiConfig.baseUrl || !config.aiConfig.apiKey) {
                statusElement.textContent = '未配置';
                statusElement.style.color = '#909399';
            } else if (config.aiConfig.enabled) {
                statusElement.textContent = '已启用';
                statusElement.style.color = '#67C23A';
            } else {
                statusElement.textContent = '已配置（未启用）';
                statusElement.style.color = '#E6A23C';
            }
        },

        testAIConnection: async function() {
            const baseUrl = document.getElementById('aiBaseUrl').value.trim();
            const apiKey = document.getElementById('aiApiKey').value.trim();
            const model = document.getElementById('aiModel').value.trim();
            
            if (!baseUrl || !apiKey) {
                alert('请先填写Base URL和API Key');
                return;
            }
            
            const statusElement = document.getElementById('aiStatus');
            statusElement.textContent = '测试中...';
            statusElement.style.color = '#409EFF';
            
            try {
                const testPrompt = '请回答：1+1等于几？';
                const cleanBaseUrl = baseUrl.replace('/chat/completions', '').replace(/\/$/, '');
                // 测试连接时跳过运行状态检查
                const response = await aiAnswerManager.callAI(testPrompt, cleanBaseUrl, apiKey, model || 'gpt-3.5-turbo', 0, true);
                
                if (response) {
                    statusElement.textContent = '✓ 连接成功';
                    statusElement.style.color = '#67C23A';
                    utils.log('AI连接测试成功');
                    alert('AI连接测试成功！\n\n测试问题：1+1等于几？\nAI回答：' + response);
                } else {
                    throw new Error('AI返回空响应');
                }
            } catch (error) {
                statusElement.textContent = '✗ 连接失败';
                statusElement.style.color = '#F56C6C';
                utils.log('AI连接测试失败:', error.message);
                alert('AI连接测试失败：' + error.message);
            }
        }
    };

    // AI答题管理器
    const aiAnswerManager = {
        // 上次请求时间，用于频率限制
        lastRequestTime: 0,
        
        // 调用AI API（带重试机制）
        callAI: async function(question, baseUrl, apiKey, model, retryCount = 0, skipRunningCheck = false) {
            try {
                // 检查是否停止（测试连接时可以跳过此检查）
                if (!skipRunningCheck && !controlPanel.isRunning) {
                    throw new Error('答题已停止');
                }
                
                // 验证参数
                if (!apiKey || !apiKey.trim()) {
                    throw new Error('API Key 为空，请检查配置');
                }
                
                if (!baseUrl || !baseUrl.trim()) {
                    throw new Error('Base URL 为空，请检查配置');
                }
                
                // 请求频率限制：确保两次请求之间有足够的延迟
                const requestDelay = config.aiConfig.requestDelay || 1000;
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < requestDelay) {
                    const waitTime = requestDelay - timeSinceLastRequest;
                    utils.log(`请求频率限制：等待 ${waitTime}ms 后继续...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                this.lastRequestTime = Date.now();
                
                // 构建完整的API URL（baseUrl + /chat/completions）
                const apiUrl = `${baseUrl}/chat/completions`;
                
                // 记录 API Key 的前几个字符用于调试（不暴露完整密钥）
                const apiKeyPreview = apiKey.length > 10 ? `${apiKey.substring(0, 10)}...` : '***';
                if (retryCount === 0) {
                    utils.log('API Key 预览:', apiKeyPreview, `(长度: ${apiKey.length})`);
                }
                
                const useStream = config.aiConfig.stream || false;
                
                const requestBody = {
                    model: model || 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个专业的答题助手。请根据题目内容，简洁准确地回答问题。对于选择题，只回答选项字母（如A、B、C、D）；对于多选题，用逗号分隔选项字母（如A,B,C）；对于判断题，只回答"正确"或"错误"；对于填空题和简答题，直接给出答案。'
                        },
                        {
                            role: 'user',
                            content: question
                        }
                    ],
                    temperature: config.aiConfig.temperature || 0.3,
                    max_tokens: config.aiConfig.maxTokens || 1500,
                    stream: useStream
                };
                
                // 添加高级参数（如果配置了）
                if (config.aiConfig.topP !== undefined) {
                    requestBody.top_p = config.aiConfig.topP;
                }
                if (config.aiConfig.frequencyPenalty !== undefined) {
                    requestBody.frequency_penalty = config.aiConfig.frequencyPenalty;
                }
                if (config.aiConfig.presencePenalty !== undefined) {
                    requestBody.presence_penalty = config.aiConfig.presencePenalty;
                }
                
                if (retryCount === 0) {
                    utils.log('API请求URL:', apiUrl);
                    utils.log('API请求模型:', requestBody.model);
                    utils.log('API请求参数:', JSON.stringify({
                        model: requestBody.model,
                        temperature: requestBody.temperature,
                        max_tokens: requestBody.max_tokens,
                        stream: requestBody.stream,
                        messages_count: requestBody.messages.length
                    }, null, 2));
                }
                
                // 确保 API Key 被正确使用（去除首尾空格）
                const cleanApiKey = apiKey.trim();
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${cleanApiKey}` // 使用完整的API密钥
                    },
                    body: JSON.stringify(requestBody)
                });

                utils.log('API响应状态:', response.status, response.statusText);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    utils.log('API错误响应:', JSON.stringify(errorData, null, 2));
                    
                    // 处理429错误：请求过多
                    if (response.status === 429) {
                        const retryOn429 = config.aiConfig.retryOn429 !== false; // 默认启用
                        const maxRetries = config.aiConfig.maxRetries || 3;
                        const retryDelay = config.aiConfig.retryDelay || 2000;
                        
                        if (retryOn429 && retryCount < maxRetries) {
                            const nextRetry = retryCount + 1;
                            const waitTime = retryDelay * (nextRetry); // 指数退避：2秒、4秒、6秒...
                            utils.log(`遇到429错误（请求过多），将在 ${waitTime}ms 后进行第 ${nextRetry}/${maxRetries} 次重试...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            return await this.callAI(question, baseUrl, apiKey, model, nextRetry, skipRunningCheck);
                        } else {
                            throw new Error(`HTTP 429: Too Many Requests${retryCount >= maxRetries ? ' (已达到最大重试次数)' : ''}`);
                        }
                    }
                    
                    throw new Error(errorData.error?.message || errorData.errors?.message || `HTTP ${response.status}: ${response.statusText}`);
                }

                // 处理流式响应
                if (useStream && response.body) {
                    return await this.handleStreamResponse(response);
                }

                // 处理非流式响应
                const data = await response.json();
                utils.log('API完整响应:', JSON.stringify(data, null, 2));
                
                // 优先从 content 获取答案
                let answer = data.choices?.[0]?.message?.content?.trim();
                
                // 如果 content 为空，尝试从 reasoning_content 中提取答案
                if (!answer) {
                    const reasoningContent = data.choices?.[0]?.message?.reasoning_content || '';
                    utils.log('content为空，尝试从reasoning_content提取答案');
                    utils.log('reasoning_content内容:', reasoningContent.substring(0, 200) + '...');
                    
                    // 从推理内容中提取答案（更智能的提取逻辑）
                    const answerPatterns = [
                        // 明确的答案表述
                        /(?:所以|因此|结论|答案|正确答案|应该选择|选择|选项)[：:是]\s*([A-Z])/i,
                        /(?:答案是|正确答案是|应该选择|选择|选项)\s*([A-Z])/i,
                        /(?:这|该|这个)(?:是|为|就是)\s*(?:正确答案|答案|选项)\s*([A-Z])/i,
                        // 错误答案的表述（找错误选项）
                        /(?:错误|不正确|不对|错误答案|错误选项)[：:是]\s*([A-Z])/i,
                        // 选项分析中的结论
                        /选项\s*([A-Z])\s*(?:是|为|就是)(?:正确|错误|答案)/i,
                        // 最后提到的选项（通常是结论）
                        /(?:所以|因此|结论|最终|答案)\s*(?:是|为|选择)\s*([A-Z])/i,
                        // 单独一行的选项字母
                        /^([A-Z])[\.、。]?\s*$/m,
                        // 在分析过程中提到的选项（作为结论）
                        /(?:选项|选择)\s*([A-Z])\s*(?:看起来|似乎|是|为)(?:正确|答案|最佳)/i,
                    ];
                    
                    // 尝试所有模式
                    for (const pattern of answerPatterns) {
                        const matches = reasoningContent.matchAll(new RegExp(pattern.source, 'gi'));
                        const foundAnswers = [];
                        for (const match of matches) {
                            if (match[1]) {
                                foundAnswers.push(match[1].toUpperCase());
                            }
                        }
                        // 如果找到多个匹配，取最后一个（通常是结论）
                        if (foundAnswers.length > 0) {
                            answer = foundAnswers[foundAnswers.length - 1];
                            utils.log('从reasoning_content提取到答案:', answer, `(模式: ${pattern.source})`);
                            break;
                        }
                    }
                    
                    // 如果还是没找到，尝试查找分析过程中提到的选项
                    if (!answer) {
                        // 查找"选项A"、"选项B"等，看哪个被标记为正确或错误
                        const optionMatches = reasoningContent.matchAll(/选项\s*([A-Z])(?:[：:，,。.]|是|为|看起来|似乎)([^。，,]*?)(?:正确|错误|答案|最佳|不对|不正确)/gi);
                        const optionAnalysis = [];
                        for (const match of optionMatches) {
                            const option = match[1].toUpperCase();
                            const analysis = match[2] || '';
                            const isCorrect = analysis.includes('正确') || analysis.includes('答案') || analysis.includes('最佳');
                            const isWrong = analysis.includes('错误') || analysis.includes('不对') || analysis.includes('不正确');
                            optionAnalysis.push({ option, isCorrect, isWrong });
                        }
                        
                        // 如果是找错误选项，找标记为错误的；否则找标记为正确的
                        const questionText = data.choices?.[0]?.message?.content || '';
                        const isLookingForWrong = questionText.includes('错误') || questionText.includes('不对');
                        
                        if (isLookingForWrong) {
                            // 找错误选项
                            const wrongOption = optionAnalysis.find(a => a.isWrong);
                            if (wrongOption) {
                                answer = wrongOption.option;
                                utils.log('从reasoning_content提取到错误选项:', answer);
                            }
                        } else {
                            // 找正确选项
                            const correctOption = optionAnalysis.find(a => a.isCorrect);
                            if (correctOption) {
                                answer = correctOption.option;
                                utils.log('从reasoning_content提取到正确选项:', answer);
                            }
                        }
                    }
                    
                    // 如果还是没找到，检查 finish_reason
                    if (!answer) {
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason === 'length') {
                            utils.log('警告: 响应因达到最大token限制而被截断，建议增加max_tokens');
                            // 尝试从最后一段提取（可能是结论）
                            const lastParagraph = reasoningContent.split('\n').filter(p => p.trim()).slice(-3).join('\n');
                            const lastMatch = lastParagraph.match(/选项\s*([A-Z])/i);
                            if (lastMatch) {
                                answer = lastMatch[1].toUpperCase();
                                utils.log('从最后一段提取到答案:', answer);
                            }
                        }
                    }
                }
                
                if (!answer) {
                    utils.log('解析后的答案为空，原始数据:', data);
                    throw new Error('AI返回的答案为空');
                }
                
                return answer;
            } catch (error) {
                utils.log('AI调用失败 - 错误类型:', error.name);
                utils.log('AI调用失败 - 错误消息:', error.message);
                if (error.stack) {
                    utils.log('AI调用失败 - 错误堆栈:', error.stack);
                }
                throw error;
            }
        },

        // 处理流式响应
        handleStreamResponse: async function(response) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let reasoningContent = '';
            let content = '';
            let doneReasoning = false;
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim() && line.startsWith('data: '));
                    
                    for (const line of lines) {
                        try {
                            const jsonStr = line.slice(6); // 移除 'data: ' 前缀
                            if (jsonStr === '[DONE]') {
                                break;
                            }
                            
                            const data = JSON.parse(jsonStr);
                            const delta = data.choices?.[0]?.delta;
                            
                            if (delta) {
                                // 处理 reasoning_content
                                if (delta.reasoning_content) {
                                    reasoningContent += delta.reasoning_content;
                                    if (!doneReasoning) {
                                        utils.log('推理中...', delta.reasoning_content.substring(0, 50));
                                    }
                                }
                                
                                // 处理 content（最终答案）
                                if (delta.content) {
                                    if (!doneReasoning) {
                                        utils.log('\n=== 最终答案 ===\n');
                                        doneReasoning = true;
                                    }
                                    content += delta.content;
                                    utils.log('答案片段:', delta.content);
                                }
                            }
                            
                            // 检查是否完成
                            if (data.choices?.[0]?.finish_reason) {
                                utils.log('流式响应完成，finish_reason:', data.choices[0].finish_reason);
                            }
                        } catch (e) {
                            // 忽略单个chunk的解析错误
                        }
                    }
                }
                
                // 优先使用 content，如果没有则从 reasoning_content 提取
                let answer = content.trim();
                
                if (!answer && reasoningContent) {
                    utils.log('content为空，尝试从reasoning_content提取答案');
                    // 使用与 callAI 相同的提取逻辑
                    answer = this.extractAnswerFromReasoning(reasoningContent);
                }
                
                if (!answer) {
                    throw new Error('AI返回的答案为空');
                }
                
                // 注意：这里不清理markdown，因为不知道题目类型，会在answerWithAI中清理
                return answer;
            } catch (error) {
                utils.log('流式响应处理失败:', error.message);
                throw error;
            }
        },

        // 从 reasoning_content 提取答案（复用逻辑）
        extractAnswerFromReasoning: function(reasoningContent) {
            const answerPatterns = [
                /(?:所以|因此|结论|答案|正确答案|应该选择|选择|选项)[：:是]\s*([A-Z])/i,
                /(?:答案是|正确答案是|应该选择|选择|选项)\s*([A-Z])/i,
                /(?:这|该|这个)(?:是|为|就是)\s*(?:正确答案|答案|选项)\s*([A-Z])/i,
                /(?:错误|不正确|不对|错误答案|错误选项)[：:是]\s*([A-Z])/i,
                /选项\s*([A-Z])\s*(?:是|为|就是)(?:正确|错误|答案)/i,
                /(?:所以|因此|结论|最终|答案)\s*(?:是|为|选择)\s*([A-Z])/i,
                /^([A-Z])[\.、。]?\s*$/m,
                /(?:选项|选择)\s*([A-Z])\s*(?:看起来|似乎|是|为)(?:正确|答案|最佳)/i,
            ];
            
            for (const pattern of answerPatterns) {
                const matches = reasoningContent.matchAll(new RegExp(pattern.source, 'gi'));
                const foundAnswers = [];
                for (const match of matches) {
                    if (match[1]) {
                        foundAnswers.push(match[1].toUpperCase());
                    }
                }
                if (foundAnswers.length > 0) {
                    return foundAnswers[foundAnswers.length - 1];
                }
            }
            
            return null;
        },

        // 使用AI回答题目
        answerWithAI: async function(questionItem, questionType, questionText, options) {
            // 检查是否已停止
            if (!controlPanel.isRunning) {
                utils.log('答题已停止，取消AI调用');
                return null;
            }
            
            if (!config.aiConfig.enabled) {
                utils.log('AI功能未启用');
                return null;
            }
            
            if (!config.aiConfig.baseUrl) {
                utils.log('AI Base URL 未配置');
                return null;
            }
            
            if (!config.aiConfig.apiKey) {
                utils.log('AI API Key 未配置');
                return null;
            }

            try {
                // 记录题目信息
                utils.log('=== AI答题开始 ===');
                utils.log('AI配置 - Base URL:', config.aiConfig.baseUrl);
                utils.log('AI配置 - Model:', config.aiConfig.model || 'gpt-3.5-turbo');
                utils.log('AI配置 - API Key:', config.aiConfig.apiKey ? `${config.aiConfig.apiKey.substring(0, 10)}...` : '未设置');
                utils.log('题目类型:', questionType === '0' ? '单选题' : questionType === '1' ? '多选题' : questionType === '2' ? '判断题' : questionType === '3' ? '填空题' : '简答题');
                utils.log('题目内容:', questionText);
                
                // 获取选项（如果有）
                let finalOptions = options || [];
                if (finalOptions.length === 0 && (questionType === '0' || questionType === '1')) {
                    // 如果没有传入选项，尝试从页面获取
                    const optionItems = questionItem.querySelectorAll('.question-option-item');
                    if (optionItems.length > 0) {
                        finalOptions = Array.from(optionItems).map(opt => {
                            const text = opt.textContent.trim().replace(/^[A-Z]、/, '').trim();
                            return text;
                        });
                    }
                }
                
                // 记录选项
                if (finalOptions.length > 0) {
                    utils.log('选项列表:');
                    finalOptions.forEach((opt, index) => {
                        const letter = String.fromCharCode(65 + index);
                        utils.log(`  ${letter}. ${opt}`);
                    });
                }
                
                // 构建问题文本，包含完整的题目信息
                let prompt = `题目：${questionText}\n\n`;
                
                if (finalOptions.length > 0) {
                    prompt += '选项：\n';
                    finalOptions.forEach((opt, index) => {
                        const letter = String.fromCharCode(65 + index); // A, B, C, D...
                        prompt += `${letter}. ${opt}\n`;
                    });
                    prompt += '\n';
                }

                // 根据题目类型添加提示
                if (questionType === '0') {
                    prompt += '这是一道单选题，请选择唯一正确答案，只回答选项字母（如A、B、C、D）。';
                } else if (questionType === '1') {
                    prompt += '这是一道多选题，请选择所有正确答案，用逗号分隔选项字母（如A,B,C）。';
                } else if (questionType === '2') {
                    prompt += '这是一道判断题，请判断对错，只回答"正确"或"错误"。';
                } else if (questionType === '3') {
                    prompt += '这是一道填空题，请填写答案，只给出答案内容，不要包含其他说明。';
                } else if (questionType === '4') {
                    prompt += '这是一道简答题，请简要回答，答案要准确完整。注意：答案中不要使用markdown代码块标记（如```），只使用普通文本和换行符。';
                }

                // 记录发送给AI的完整prompt
                utils.log('发送给AI的提示词:');
                utils.log(prompt);

                utils.log('正在调用AI API...');
                const answer = await this.callAI(
                    prompt,
                    config.aiConfig.baseUrl,
                    config.aiConfig.apiKey,
                    config.aiConfig.model
                );

                if (answer) {
                    // 如果是简答题，清理markdown代码块标记
                    if (questionType === '4') {
                        answer = utils.cleanMarkdownCodeBlocks(answer);
                    }
                    utils.log('AI原始响应:', answer);
                    utils.log('=== AI答题完成 ===');
                } else {
                    utils.log('AI返回空响应');
                    utils.log('=== AI答题失败 ===');
                }
                
                return answer;
            } catch (error) {
                utils.log('AI答题异常:', error.message);
                utils.log('错误详情:', error);
                utils.log('=== AI答题失败 ===');
                return null;
            }
        }
    };

    // 分数分析器
    const scoreAnalyzer = {
        // 分析答题结果，计算已确定和未确定的分数
        analyzeScore: function(data) {
            try {
                if (!data || !data.resultObject) {
                    return null;
                }

                const result = data.resultObject;
                let confirmedScore = 0; // 已确定分数
                let unconfirmedScore = 0; // 未确定分数
                let confirmedCount = 0; // 已确定题目数
                let unconfirmedCount = 0; // 未确定题目数

                // 遍历所有题目类型
                const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                
                questionTypes.forEach(type => {
                    if (result[type] && result[type].lists) {
                        result[type].lists.forEach(question => {
                            const score = question.score || 0; // 题目总分
                            const stuScore = question.stuScore || 0; // 学生得分
                            const correct = question.correct; // 是否正确（可能为null、true、false）
                            
                            // 判断是否已确定分数
                            // 已确定：correct !== null（客观题已评分，无论对错）
                            // 未确定：correct === null（通常是主观题，需要人工评分）
                            const isConfirmed = correct !== null;
                            
                            if (isConfirmed) {
                                // 已确定：使用实际得分（stuScore）
                                confirmedScore += stuScore;
                                confirmedCount++;
                            } else {
                                // 未确定：使用题目总分（score），表示可能获得的分数
                                unconfirmedScore += score;
                                unconfirmedCount++;
                            }
                        });
                    }
                });

                // 验证：使用各类型的studentTotalScore进行验证（如果可用）
                let verifiedConfirmedScore = 0;
                questionTypes.forEach(type => {
                    if (result[type] && result[type].studentTotalScore !== null && result[type].studentTotalScore !== undefined) {
                        verifiedConfirmedScore += result[type].studentTotalScore;
                    }
                });

                // 如果验证分数与计算分数差异较大，使用验证分数（更准确）
                if (verifiedConfirmedScore > 0 && Math.abs(verifiedConfirmedScore - confirmedScore) > 0.1) {
                    utils.log(`分数验证：计算分数 ${confirmedScore}，验证分数 ${verifiedConfirmedScore}，使用验证分数`);
                    confirmedScore = verifiedConfirmedScore;
                }

                // 获取题目总数和总分
                const totalQuestions = result.questionsNumber || (confirmedCount + unconfirmedCount);
                const totalTestScore = result.testScore || (confirmedScore + unconfirmedScore);

                return {
                    confirmedScore: Math.round(confirmedScore * 100) / 100, // 保留2位小数
                    unconfirmedScore: Math.round(unconfirmedScore * 100) / 100,
                    confirmedCount: confirmedCount,
                    unconfirmedCount: unconfirmedCount,
                    totalScore: Math.round((confirmedScore + unconfirmedScore) * 100) / 100,
                    totalQuestions: totalQuestions, // 题目总数
                    totalTestScore: totalTestScore // 试卷总分
                };
            } catch (e) {
                utils.log('分数分析失败:', e.message);
                return null;
            }
        },

        // 更新控制面板显示的分数
        updateScoreDisplay: function(scoreInfo, pageStatus) {
            if (!scoreInfo) {
                utils.log('updateScoreDisplay: scoreInfo为空');
                return;
            }
            
            // 更新header右上角的分数显示（简洁版）
            const headerScoreElement = document.getElementById('headerScoreInfo');
            if (headerScoreElement) {
                let statusText = '';
                if (pageStatus) {
                    statusText = `<span style="color: ${pageStatus.isCompleted ? '#67C23A' : '#E6A23C'}; margin-right: 8px;">${pageStatus.isCompleted ? '✓ 已完成' : '进行中'}</span>`;
                }
                let totalInfo = '';
                if (scoreInfo.totalQuestions && scoreInfo.totalTestScore) {
                    totalInfo = `<span style="color: #909399; margin-left: 5px; font-size: 11px;">(${scoreInfo.totalQuestions}题/${scoreInfo.totalTestScore}分)</span>`;
                }
                headerScoreElement.innerHTML = `
                    ${statusText}
                    <span style="color: #67C23A;">已定:${scoreInfo.confirmedScore}</span>
                    <span style="color: #E6A23C; margin-left: 5px;">未定:${scoreInfo.unconfirmedScore}</span>
                    ${totalInfo}
                `;
            }
            
            // 更新控制标签页中的详细分数显示
            const scoreElement = document.getElementById('scoreInfo');
            if (scoreElement) {
                let statusHtml = '';
                if (pageStatus) {
                    statusHtml = `
                        <div style="margin-bottom: 8px; padding: 6px; background: ${pageStatus.isCompleted ? '#f0f9ff' : '#fff7e6'}; border-radius: 4px; border-left: 3px solid ${pageStatus.isCompleted ? '#67C23A' : '#E6A23C'};">
                            <div style="font-size: 12px; color: #303133;">
                                <span style="font-weight: bold;">答题状态：</span>
                                <span style="color: ${pageStatus.isCompleted ? '#67C23A' : '#E6A23C'};">
                                    ${pageStatus.isCompleted ? '✓ 已完成答题' : '○ 答题进行中'}
                                </span>
                            </div>
                            ${pageStatus.submitTime ? `<div style="font-size: 11px; color: #909399; margin-top: 3px;">提交时间：${pageStatus.submitTime}</div>` : ''}
                        </div>
                    `;
                }
                
                scoreElement.innerHTML = `
                    <div style="margin-top: 10px; padding: 10px; background: #f0f9ff; border-radius: 4px; border-left: 4px solid #409EFF;">
                        <div style="font-size: 13px; font-weight: bold; color: #303133; margin-bottom: 8px;">答题分数统计</div>
                        ${statusHtml}
                        <div style="font-size: 12px; color: #606266; line-height: 1.8;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>已确定分数：</span>
                                <span style="color: #67C23A; font-weight: bold;">${scoreInfo.confirmedScore} 分</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>未确定分数：</span>
                                <span style="color: #E6A23C; font-weight: bold;">${scoreInfo.unconfirmedScore} 分</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 5px; padding-top: 5px; border-top: 1px solid #dcdfe6;">
                                <span>当前得分：</span>
                                <span style="color: #409EFF; font-weight: bold;">${scoreInfo.totalScore} 分</span>
                            </div>
                            ${scoreInfo.totalTestScore ? `
                            <div style="display: flex; justify-content: space-between; margin-top: 5px;">
                                <span>试卷总分：</span>
                                <span style="color: #606266; font-weight: bold;">${scoreInfo.totalTestScore} 分</span>
                            </div>
                            ` : ''}
                            <div style="font-size: 11px; color: #909399; margin-top: 5px;">
                                已确定 ${scoreInfo.confirmedCount} 题，未确定 ${scoreInfo.unconfirmedCount} 题
                                ${scoreInfo.totalQuestions ? `，共 ${scoreInfo.totalQuestions} 题` : ''}
                            </div>
                        </div>
                    </div>
                `;
                utils.log('分数显示已更新到控制面板');
            } else {
                utils.log('updateScoreDisplay: 未找到scoreInfo元素，控制面板可能还未创建');
            }
        },

        // 检测页面答题状态
        detectPageStatus: function(data) {
            try {
                if (!data || !data.resultObject) {
                    return null;
                }

                const result = data.resultObject;
                // 检查是否有提交时间
                const submitTime = result.jjTime || null;
                const isCompleted = !!submitTime; // 如果有提交时间，说明已完成

                return {
                    isCompleted: isCompleted,
                    submitTime: submitTime,
                    testName: result.testName || '',
                    testScore: result.testScore || 0,
                    duration: result.duration || 0
                };
            } catch (e) {
                utils.log('页面状态检测失败:', e.message);
                return null;
            }
        },

        // 从答题结果中反向提取正确答案（correct === true 的题目）
        extractCorrectAnswers: function(data) {
            try {
                if (!data || !data.resultObject) {
                    return { extracted: 0, skipped: 0 };
                }

                const result = data.resultObject;
                let extractedCount = 0;
                let skippedCount = 0;

                // 遍历所有题目类型
                const questionTypes = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jieda'];
                
                questionTypes.forEach(type => {
                    if (result[type] && result[type].lists) {
                        result[type].lists.forEach(question => {
                            const questionId = question.id || question.questionId;
                            const correct = question.correct;
                            const stuAnswer = question.stuAnswer;
                            const questionContent = question.questionContent || question.questionContentText || '';
                            const questionType = question.questionType || type;
                            
                            // 如果题目答对了（correct === true），提取正确答案
                            if (correct === true && stuAnswer && questionId) {
                                // 检查答案库中是否已有答案
                                const existingAnswer = answerDB[questionId];
                                
                                // 如果答案库中没有答案，或者答案为空，则提取
                                if (!existingAnswer || !existingAnswer.answer) {
                                    // 根据题目类型处理答案格式
                                    let answer = stuAnswer;
                                    
                                    // 处理单选题（类型 "0"）
                                    if (questionType === '0' || questionType === 'danxuan') {
                                        // 单选题答案通常是单个字母，如 "A", "B", "C", "D"
                                        if (typeof stuAnswer === 'string') {
                                            answer = stuAnswer.trim().toUpperCase();
                                        }
                                    }
                                    // 处理多选题（类型 "1"）
                                    else if (questionType === '1' || questionType === 'duoxuan') {
                                        if (typeof stuAnswer === 'string') {
                                            // 如果是字符串，可能是 "A,B,C" 或 "ABC" 格式
                                            if (stuAnswer.includes(',') || stuAnswer.includes('，')) {
                                                answer = stuAnswer.split(/[,，]/).map(a => a.trim().toUpperCase()).filter(a => a);
                                            } else {
                                                // "ABC" 格式转换为数组
                                                answer = stuAnswer.trim().toUpperCase().split('').filter(a => /[A-Z]/.test(a));
                                            }
                                        } else if (Array.isArray(stuAnswer)) {
                                            answer = stuAnswer.map(a => String(a).trim().toUpperCase()).filter(a => a);
                                        }
                                    }
                                    // 处理判断题（类型 "2"）
                                    else if (questionType === '2' || questionType === 'panduan') {
                                        // 判断题答案可能是 "对"/"错" 或 "正确"/"错误"
                                        if (stuAnswer === '对' || stuAnswer === '正确' || stuAnswer === true || stuAnswer === 'true') {
                                            answer = '对';
                                        } else if (stuAnswer === '错' || stuAnswer === '错误' || stuAnswer === false || stuAnswer === 'false') {
                                            answer = '错';
                                        } else {
                                            answer = String(stuAnswer).trim();
                                        }
                                    }
                                    // 处理填空题和简答题（类型 "3", "4"）
                                    else if (questionType === '3' || questionType === '4' || questionType === 'tiankong' || questionType === 'jieda') {
                                        // 保持原样，可能是文本
                                        answer = String(stuAnswer).trim();
                                    }
                                    
                                    // 保存到答案库
                                    answerDB[questionId] = {
                                        type: questionType,
                                        answer: answer,
                                        solution: question.solution || '',
                                        questionContent: questionContent,
                                        questionId: question.questionId || questionId,
                                        source: '答题结果提取' // 标记来源
                                    };
                                    
                                    // 如果questionId和id不同，也建立映射
                                    if (question.questionId && question.questionId !== questionId) {
                                        answerDB[question.questionId] = answerDB[questionId];
                                    }
                                    
                                    extractedCount++;
                                } else {
                                    skippedCount++;
                                }
                            } else if (correct === false) {
                                // 答错的题目跳过，不提取
                                skippedCount++;
                            }
                        });
                    }
                });

                if (extractedCount > 0) {
                    // 保存到本地存储
                    answerDBManager.saveToStorage();
                    // 更新答题记录
                    answerRecordManager.initFromAnswerDB();
                    utils.log(`从答题结果中提取了 ${extractedCount} 道正确答案，跳过 ${skippedCount} 道题目`);
                }

                return { extracted: extractedCount, skipped: skippedCount };
            } catch (e) {
                utils.log('提取正确答案失败:', e.message);
                return { extracted: 0, skipped: 0 };
            }
        },

        // 从当前页面数据中分析分数（用于页面加载时）
        analyzeFromPage: async function() {
            try {
                const currentUrl = window.location.href;
                let busyworkId = null;

                // 方法1: 从答题页面URL提取busyworkId（lookPaper/busywork/{busyworkId}）
                if (currentUrl.includes('/lookPaper/busywork/')) {
                    const match = currentUrl.match(/\/lookPaper\/busywork\/([^/?]+)/);
                    if (match && match[1]) {
                        busyworkId = match[1];
                        utils.log('从答题页面URL提取busyworkId:', busyworkId);
                    }
                }

                // 方法2: 从URL参数获取busyworkId（findStudentBusywork?busyworkId=xxx）
                if (!busyworkId) {
                    const urlParams = new URLSearchParams(window.location.search);
                    busyworkId = urlParams.get('busyworkId');
                }

                // 如果都没有，检查是否是答题结果页面
                if (!busyworkId && !currentUrl.includes('findStudentBusywork') && !currentUrl.includes('busyworkId')) {
                    return;
                }

                if (busyworkId) {
                    utils.log('检测到答题相关页面，尝试获取分数数据...');
                    try {
                        // 构建完整URL
                        const baseUrl = window.location.origin;
                        const apiUrl = `${baseUrl}/back/bxg/my/busywork/findStudentBusywork?busyworkId=${busyworkId}&t=${Date.now()}`;
                        utils.log('请求分数数据URL:', apiUrl);
                        
                        const response = await fetch(apiUrl);
                        if (response.ok) {
                            const data = await response.json();
                            utils.log('获取到答题结果数据');
                            
                            // 从答题结果中提取正确答案（correct === true 的题目）
                            const extractResult = this.extractCorrectAnswers(data);
                            if (extractResult.extracted > 0) {
                                utils.log(`已从答题结果中提取 ${extractResult.extracted} 道正确答案到答案库`);
                                if (typeof controlPanel !== 'undefined' && controlPanel.updateAnswerCount) {
                                    controlPanel.updateAnswerCount();
                                }
                            }
                            
                            // 分析分数
                            const scoreInfo = this.analyzeScore(data);
                            // 检测页面状态
                            const pageStatus = this.detectPageStatus(data);
                            
                            if (scoreInfo) {
                                utils.log('从页面数据分析分数 - 已确定:', scoreInfo.confirmedScore, '分，未确定:', scoreInfo.unconfirmedScore, '分，总计:', scoreInfo.totalScore, '分');
                                if (pageStatus) {
                                    utils.log('页面状态 - 已完成:', pageStatus.isCompleted, '提交时间:', pageStatus.submitTime);
                                }
                                // 延迟确保控制面板已创建
                                setTimeout(() => {
                                    this.updateScoreDisplay(scoreInfo, pageStatus);
                                }, 1500);
                            } else {
                                utils.log('分数分析返回null，数据格式可能不正确');
                            }
                        } else {
                            utils.log('请求分数数据失败，状态码:', response.status);
                        }
                    } catch (e) {
                        utils.log('从页面获取分数数据失败:', e.message, e.stack);
                    }
                } else {
                    utils.log('未找到busyworkId，无法获取分数数据');
                }
            } catch (e) {
                utils.log('analyzeFromPage失败:', e.message, e.stack);
            }
        }
    };

    // 网络请求拦截器 - 自动获取题库数据
    const networkInterceptor = {
        init: function() {
            // 检查响应数据是否是题目数据格式
            const isQuestionData = function(data) {
                if (!data) return false;
                // 检查是否是 index.json 格式
                if (data.resultObject) {
                    const result = data.resultObject;
                    return !!(result.danxuan || result.duoxuan || result.panduan || result.tiankong || result.jieda);
                }
                // 检查是否是数组格式（fasfa.json）
                if (Array.isArray(data) && data.length > 0) {
                    return Array.isArray(data[0]) && data[0].length > 0 && data[0][0].id;
                }
                return false;
            };

            // 处理题目数据
            const handleQuestionData = async function(data, source) {
                try {
                    if (isQuestionData(data)) {
                        utils.log(`检测到题目数据请求（${source}），自动加载...`);
                        if (answerDBManager.loadFromJSON(data)) {
                            // 执行去重
                            const duplicateCount = answerDBManager.deduplicateByContent();
                            
                            // 初始化答题记录（从题库加载）
                            answerRecordManager.initFromAnswerDB();
                            
                            // 如果AI已配置且启用自动分析，自动分析题目
                            if (config.aiConfig.enabled && config.aiConfig.baseUrl && config.aiConfig.apiKey && config.aiConfig.autoAnalyzeWithAI) {
                                utils.log('开始使用AI批量分析题目（包含题目、选项和solution）...');
                                // 异步执行，不阻塞主流程
                                answerDBManager.analyzeQuestionsFromData(data).then(analyzedCount => {
                                    if (analyzedCount > 0) {
                                        // 更新答题记录
                                        answerRecordManager.initFromAnswerDB();
                                        controlPanel.updateAnswerCount();
                                    }
                                }).catch(err => {
                                    utils.log('AI批量分析失败:', err.message);
                                });
                            } else if (config.aiConfig.enabled && config.aiConfig.baseUrl && config.aiConfig.apiKey) {
                                // 只分析solution字段
                                utils.log('开始使用AI批量分析solution字段...');
                                answerDBManager.analyzeSolutionsWithAI().then(analyzedCount => {
                                    if (analyzedCount > 0) {
                                        answerRecordManager.initFromAnswerDB();
                                        controlPanel.updateAnswerCount();
                                    }
                                }).catch(err => {
                                    utils.log('AI批量分析失败:', err.message);
                                });
                            }
                            
                            answerDBManager.saveToStorage();
                            controlPanel.updateAnswerCount();
                            utils.log(`已自动从网络请求加载题目数据，共 ${Object.keys(answerDB).length} 道题目`);
                            if (duplicateCount > 0) {
                                utils.log(`已去除 ${duplicateCount} 道重复题目`);
                            }
                            return true;
                        }
                    }
                } catch (e) {
                    utils.log('解析题目数据失败:', e.message);
                }
                return false;
            };

            // 拦截 fetch 请求
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0] || '';
                const response = await originalFetch.apply(this, args);
                
                // 检查响应内容是否为题目数据（不依赖URL）
                try {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const clonedResponse = response.clone();
                        const data = await clonedResponse.json();
                        
                        // 检查是否是答题后的结果（findStudentBusywork）
                        let urlStr = '';
                        if (typeof url === 'string') {
                            urlStr = url;
                        } else if (url && typeof url === 'object') {
                            urlStr = url.url || url.href || '';
                        }
                        // 支持完整URL和相对路径
                        if (urlStr && (urlStr.includes('findStudentBusywork') || urlStr.includes('/back/bxg/my/busywork/findStudentBusywork'))) {
                            utils.log('检测到答题结果请求:', urlStr);
                            
                            // 从答题结果中提取正确答案（correct === true 的题目）
                            const extractResult = scoreAnalyzer.extractCorrectAnswers(data);
                            if (extractResult.extracted > 0) {
                                utils.log(`已从答题结果中提取 ${extractResult.extracted} 道正确答案到答案库`);
                                controlPanel.updateAnswerCount();
                            }
                            
                            // 分析分数
                            const scoreInfo = scoreAnalyzer.analyzeScore(data);
                            const pageStatus = scoreAnalyzer.detectPageStatus(data);
                            if (scoreInfo) {
                                utils.log('分数分析结果 - 已确定:', scoreInfo.confirmedScore, '分，未确定:', scoreInfo.unconfirmedScore, '分，总计:', scoreInfo.totalScore, '分');
                                if (pageStatus) {
                                    utils.log('页面状态 - 已完成:', pageStatus.isCompleted, '提交时间:', pageStatus.submitTime);
                                }
                                // 延迟一下确保控制面板已创建
                                setTimeout(() => {
                                    scoreAnalyzer.updateScoreDisplay(scoreInfo, pageStatus);
                                }, 500);
                            } else {
                                utils.log('分数分析失败：数据格式不正确');
                            }
                        }
                        
                        // 检查是否是题目数据格式
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
                
                // 检查所有响应，判断是否为题目数据（不依赖URL）
                xhr.addEventListener('load', function() {
                    try {
                        let data = null;
                        if (xhr.responseType === '' || xhr.responseType === 'text') {
                            const responseText = xhr.responseText;
                            if (responseText) {
                                try {
                                    data = JSON.parse(responseText);
                                } catch (e) {
                                    // 不是JSON格式，忽略
                                    return;
                                }
                            }
                        } else if (xhr.responseType === 'json') {
                            data = xhr.response;
                        }
                        
                        if (data) {
                            // 检查是否是答题后的结果（findStudentBusywork）
                            if (xhr._url && typeof xhr._url === 'string' && xhr._url.includes('findStudentBusywork')) {
                                utils.log('检测到答题结果请求（XHR）:', xhr._url);
                                
                                // 从答题结果中提取正确答案（correct === true 的题目）
                                const extractResult = scoreAnalyzer.extractCorrectAnswers(data);
                                if (extractResult.extracted > 0) {
                                    utils.log(`已从答题结果中提取 ${extractResult.extracted} 道正确答案到答案库`);
                                    controlPanel.updateAnswerCount();
                                }
                                
                                // 分析分数
                                const scoreInfo = scoreAnalyzer.analyzeScore(data);
                                const pageStatus = scoreAnalyzer.detectPageStatus(data);
                                if (scoreInfo) {
                                    utils.log('分数分析结果 - 已确定:', scoreInfo.confirmedScore, '分，未确定:', scoreInfo.unconfirmedScore, '分，总计:', scoreInfo.totalScore, '分');
                                    if (pageStatus) {
                                        utils.log('页面状态 - 已完成:', pageStatus.isCompleted, '提交时间:', pageStatus.submitTime);
                                    }
                                    // 延迟一下确保控制面板已创建
                                    setTimeout(() => {
                                        scoreAnalyzer.updateScoreDisplay(scoreInfo, pageStatus);
                                    }, 500);
                                } else {
                                    utils.log('分数分析失败：数据格式不正确');
                                }
                            }
                            
                            // 检查是否是题目数据格式
                            if (isQuestionData(data)) {
                                handleQuestionData(data, 'XHR');
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                });
                
                return originalSend.apply(this, args);
            };
            
            utils.log('网络请求拦截器已启动，将自动检测并加载题目数据（不依赖文件名）');
        }
    };

    // 初始化
    function init() {
        utils.log('自动答题脚本已加载');

        // 尝试从本地存储加载答案数据
        answerDBManager.loadFromStorage();

        // 尝试从本地存储加载AI配置
        const savedAIConfig = GM_getValue('aiConfig', null);
        if (savedAIConfig) {
            config.aiConfig = { ...config.aiConfig, ...savedAIConfig };
            // 兼容旧版本的 apiUrl 配置
            if (savedAIConfig.apiUrl && !savedAIConfig.baseUrl) {
                config.aiConfig.baseUrl = savedAIConfig.apiUrl.replace('/chat/completions', '').replace(/\/$/, '');
            }
            utils.log('已从浏览器存储加载AI配置');
        }

        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(startScript, 1000);
            });
        } else {
            setTimeout(startScript, 1000);
        }
    }

    function startScript() {
        // 创建控制面板
        controlPanel.create();

        // 启动网络请求拦截器（自动获取题库数据）
        networkInterceptor.init();

        // 加载答题记录
        if (!answerRecordManager.loadFromStorage()) {
            // 如果答案数据库已加载，初始化答题记录
            if (Object.keys(answerDB).length > 0) {
                answerRecordManager.initFromAnswerDB();
            }
        }
        
        // 如果答案数据库已加载，可以自动开始答题
        if (Object.keys(answerDB).length > 0) {
            utils.log('检测到答案数据库，可以开始答题');
        } else {
            utils.log('等待自动检测并加载题目数据');
        }

        // 如果是答题相关页面，尝试分析分数（答题页面或结果页面）
        setTimeout(() => {
            scoreAnalyzer.analyzeFromPage();
        }, 2000);
    }

    // 启动脚本
    init();

})();

