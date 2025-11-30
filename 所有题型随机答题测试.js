// 所有题型随机答题测试 - 在控制台运行

async function testAllQuestionTypes() {
    console.log('=== 所有题型随机答题测试 ===\n');
    
    const results = {
        单选题: { total: 0, answered: 0, success: 0 },
        多选题: { total: 0, answered: 0, success: 0 },
        判断题: { total: 0, answered: 0, success: 0 },
        填空题: { total: 0, answered: 0, success: 0 },
        简答题: { total: 0, answered: 0, success: 0 }
    };
    
    // ========== 1. 测试单选题 ==========
    console.log('\n【1. 单选题测试】');
    const danxuanItems = Array.from(document.querySelectorAll('#danxuanQuestionBox .questionItem'));
    const unansweredDanxuan = danxuanItems.filter(item => {
        return !item.querySelector('input[type="radio"]:checked');
    });
    
    results.单选题.total = danxuanItems.length;
    results.单选题.answered = danxuanItems.length - unansweredDanxuan.length;
    
    if (unansweredDanxuan.length > 0) {
        const testItem = unansweredDanxuan[0];
        const radioInputs = Array.from(testItem.querySelectorAll('input[type="radio"]'));
        if (radioInputs.length > 0) {
            const randomRadio = radioInputs[Math.floor(Math.random() * radioInputs.length)];
            console.log(`测试题目: ${testItem.getAttribute('data-id')}`);
            console.log(`随机选择: "${randomRadio.value}"`);
            randomRadio.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            if (randomRadio.checked) {
                console.log('✅ 单选题填充成功');
                results.单选题.success = 1;
            } else {
                console.log('❌ 单选题填充失败');
            }
        }
    } else {
        console.log('所有单选题已答');
    }
    
    // ========== 2. 测试多选题 ==========
    console.log('\n【2. 多选题测试】');
    const duoxuanItems = Array.from(document.querySelectorAll('#duoxuanQuestionBox .questionItem'));
    const unansweredDuoxuan = duoxuanItems.filter(item => {
        const checkedBoxes = item.querySelectorAll('input[type="checkbox"]:checked, .el-checkbox.is-checked');
        return checkedBoxes.length === 0;
    });
    
    results.多选题.total = duoxuanItems.length;
    results.多选题.answered = duoxuanItems.length - unansweredDuoxuan.length;
    
    if (unansweredDuoxuan.length > 0) {
        const testItem = unansweredDuoxuan[0];
        const checkboxInputs = Array.from(testItem.querySelectorAll('input[type="checkbox"]'));
        if (checkboxInputs.length > 0) {
            // 随机选择1-3个选项
            const selectCount = Math.min(1 + Math.floor(Math.random() * 3), checkboxInputs.length);
            const selected = [];
            for (let i = 0; i < selectCount; i++) {
                const randomIndex = Math.floor(Math.random() * checkboxInputs.length);
                const checkbox = checkboxInputs[randomIndex];
                if (!selected.includes(checkbox)) {
                    selected.push(checkbox);
                    checkbox.click();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            const checkedCount = testItem.querySelectorAll('input[type="checkbox"]:checked, .el-checkbox.is-checked').length;
            if (checkedCount > 0) {
                console.log(`✅ 多选题填充成功，选中 ${checkedCount} 个选项`);
                results.多选题.success = 1;
            } else {
                console.log('❌ 多选题填充失败');
            }
        }
    } else {
        console.log('所有多选题已答');
    }
    
    // ========== 3. 测试判断题 ==========
    console.log('\n【3. 判断题测试】');
    const panduanItems = Array.from(document.querySelectorAll('#panduanQuestionBox .questionItem'));
    const unansweredPanduan = panduanItems.filter(item => {
        return !item.querySelector('input[type="radio"]:checked');
    });
    
    results.判断题.total = panduanItems.length;
    results.判断题.answered = panduanItems.length - unansweredPanduan.length;
    
    if (unansweredPanduan.length > 0) {
        const testItem = unansweredPanduan[0];
        const radioInputs = Array.from(testItem.querySelectorAll('input[type="radio"]'));
        if (radioInputs.length >= 2) {
            // 判断题通常只有两个选项，随机选择一个
            const randomRadio = radioInputs[Math.floor(Math.random() * 2)];
            console.log(`测试题目: ${testItem.getAttribute('data-id')}`);
            console.log(`随机选择: "${randomRadio.value}"`);
            randomRadio.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            if (randomRadio.checked) {
                console.log('✅ 判断题填充成功');
                results.判断题.success = 1;
            } else {
                console.log('❌ 判断题填充失败');
            }
        }
    } else {
        console.log('所有判断题已答');
    }
    
    // ========== 4. 测试填空题 ==========
    console.log('\n【4. 填空题测试】');
    const tiankongItems = Array.from(document.querySelectorAll('#tiankongQuestionBox .questionItem'));
    const unansweredTiankong = tiankongItems.filter(item => {
        const inputs = item.querySelectorAll('input.tk_input[data-questionid]');
        return Array.from(inputs).every(inp => !inp.value || !inp.value.trim());
    });
    
    results.填空题.total = tiankongItems.length;
    results.填空题.answered = tiankongItems.length - unansweredTiankong.length;
    
    if (unansweredTiankong.length > 0) {
        const testItem = unansweredTiankong[0];
        const fillInputs = Array.from(testItem.querySelectorAll('input.tk_input[data-questionid]'));
        if (fillInputs.length > 0) {
            const testAnswer = `测试答案${Math.floor(Math.random() * 100)}`;
            for (const input of fillInputs) {
                input.value = testAnswer;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            const filledCount = fillInputs.filter(inp => inp.value && inp.value.trim()).length;
            if (filledCount > 0) {
                console.log(`✅ 填空题填充成功，填充了 ${filledCount} 个输入框`);
                results.填空题.success = 1;
            } else {
                console.log('❌ 填空题填充失败');
            }
        }
    } else {
        console.log('所有填空题已答');
    }
    
    // ========== 5. 测试简答题 ==========
    console.log('\n【5. 简答题测试】');
    const jiandaItems = Array.from(document.querySelectorAll('#jiandaQuestionBox .questionItem'));
    const unansweredJianda = jiandaItems.filter(item => {
        const editorBox = item.querySelector('.editor-box');
        if (!editorBox) return true;
        // 检查 iframe 编辑器内容
        const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeBody = iframeDoc.body;
                if (iframeBody && (iframeBody.textContent || iframeBody.innerText)) {
                    const content = (iframeBody.textContent || iframeBody.innerText).trim();
                    if (content) return false;
                }
            } catch (e) {
                // 无法访问iframe，认为是未答
            }
        }
        // 检查 textarea
        const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
        if (textarea && textarea.value && textarea.value.trim()) return false;
        return true;
    });
    
    results.简答题.total = jiandaItems.length;
    results.简答题.answered = jiandaItems.length - unansweredJianda.length;
    
    if (unansweredJianda.length > 0) {
        const testItem = unansweredJianda[0];
        const editorBox = testItem.querySelector('.editor-box');
        if (editorBox) {
            const testAnswer = `这是测试答案内容，用于验证简答题填充功能是否正常。时间戳：${new Date().getTime()}`;
            let success = false;
            
            // 方法1: 尝试操作 iframe 编辑器（kindeditor的主要编辑区域）
            const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
            if (iframe) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const iframeBody = iframeDoc.body;
                    if (iframeBody) {
                        // 将换行符转换为 <br> 标签以在富文本编辑器中正确显示
                        const formattedAnswer = testAnswer.replace(/\n/g, '<br>');
                        
                        // 直接修改body的内容（替换 <body class="ke-content"> 里面的内容）
                        iframeBody.innerHTML = formattedAnswer;
                        
                        // 触发事件
                        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                        iframeDoc.dispatchEvent(inputEvent);
                        iframeBody.dispatchEvent(inputEvent);
                        
                        // 触发其他可能需要的事件
                        ['keyup', 'keydown', 'blur', 'change'].forEach(eventType => {
                            const evt = new Event(eventType, { bubbles: true, cancelable: true });
                            iframeBody.dispatchEvent(evt);
                            iframeDoc.dispatchEvent(evt);
                        });
                        
                        // 尝试同步到textarea
                        const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                        if (textarea) {
                            textarea.value = testAnswer;
                            ['input', 'change'].forEach(eventType => {
                                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                            });
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // 验证是否填充成功
                        const finalContent = (iframeBody.textContent || iframeBody.innerText || '').trim();
                        if (finalContent) {
                            console.log('✅ 简答题填充成功（通过iframe）');
                            console.log(`填充内容: ${finalContent.substring(0, 50)}...`);
                            success = true;
                            results.简答题.success = 1;
                        }
                    }
                } catch (e) {
                    console.log(`无法访问iframe编辑器: ${e.message}`);
                }
            }
            
            // 方法2: 如果iframe方法失败，尝试操作 textarea
            if (!success) {
                const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
                if (textarea) {
                    textarea.value = testAnswer;
                    ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                        textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                    });
                    await new Promise(resolve => setTimeout(resolve, 300));
                    if (textarea.value && textarea.value.trim()) {
                        console.log('✅ 简答题填充成功（通过textarea）');
                        success = true;
                        results.简答题.success = 1;
                    } else {
                        console.log('❌ 简答题填充失败');
                    }
                } else {
                    console.log('未找到编辑器元素（iframe和textarea都未找到）');
                }
            }
        }
    } else {
        console.log('所有简答题已答');
    }
    
    // ========== 测试结果汇总 ==========
    console.log('\n=== 测试结果汇总 ===');
    console.table({
        '题型': Object.keys(results),
        '总题数': Object.values(results).map(r => r.total),
        '已答题数': Object.values(results).map(r => r.answered),
        '测试成功': Object.values(results).map(r => r.success)
    });
    
    const totalSuccess = Object.values(results).reduce((sum, r) => sum + r.success, 0);
    console.log(`\n✅ 成功测试了 ${totalSuccess} 种题型`);
    console.log('所有题型的填充功能测试完成！');
}

// 运行测试
testAllQuestionTypes();

