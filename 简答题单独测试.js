// 简答题单独测试 - 可以直接运行
async function testJiandaOnly() {
    console.log('=== 简答题测试 ===\n');
    
    const jiandaItems = Array.from(document.querySelectorAll('#jiandaQuestionBox .questionItem'));
    console.log(`找到 ${jiandaItems.length} 道简答题`);
    
    // 找到未答的简答题
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
                    if (content && content !== '123') return false; // 排除默认的"123"
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
    
    console.log(`未答简答题: ${unansweredJianda.length} 道`);
    
    if (unansweredJianda.length === 0) {
        console.log('所有简答题已答');
        return;
    }
    
    // 测试第一道未答题
    const testItem = unansweredJianda[0];
    const questionId = testItem.getAttribute('data-id');
    console.log(`\n测试题目ID: ${questionId}`);
    
    const editorBox = testItem.querySelector('.editor-box');
    if (!editorBox) {
        console.log('❌ 未找到编辑器容器');
        return;
    }
    
    const testAnswer = `这是测试答案内容，用于验证简答题填充功能是否正常。时间戳：${new Date().getTime()}`;
    let success = false;
    
    // 方法1: 操作 iframe 编辑器（kindeditor的主要编辑区域）
    const iframe = editorBox.querySelector('iframe.ke-edit-iframe');
    if (iframe) {
        try {
            console.log('找到 iframe 编辑器，尝试填充...');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeBody = iframeDoc.body;
            
            if (iframeBody) {
                console.log('当前 iframe body 内容:', iframeBody.innerHTML.substring(0, 100));
                
                // 直接修改body的内容（替换 <body class="ke-content"> 里面的内容）
                iframeBody.innerHTML = testAnswer;
                
                console.log('已设置 iframe body 内容');
                
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
                    console.log('已同步到 textarea');
                }
                
                // 尝试触发kindeditor的同步
                const keContainer = editorBox.querySelector('.ke-container');
                if (keContainer) {
                    ['sync', 'change'].forEach(eventType => {
                        keContainer.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                    });
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 验证是否填充成功
                const finalContent = (iframeBody.textContent || iframeBody.innerText || '').trim();
                console.log('验证填充结果，当前内容:', finalContent.substring(0, 50));
                
                if (finalContent && finalContent !== '123') {
                    console.log('✅ 简答题填充成功（通过iframe）');
                    console.log(`填充内容: ${finalContent.substring(0, 100)}...`);
                    success = true;
                } else {
                    console.log('❌ 填充后内容仍然为空或为默认值');
                }
            }
        } catch (e) {
            console.log(`❌ 无法访问iframe编辑器: ${e.message}`);
            console.error('详细错误:', e);
        }
    } else {
        console.log('未找到 iframe 编辑器');
    }
    
    // 方法2: 如果iframe方法失败，尝试操作 textarea
    if (!success) {
        console.log('\n尝试方法2: 直接操作 textarea');
        const textarea = editorBox.querySelector('textarea.ke-edit-textarea');
        if (textarea) {
            textarea.value = testAnswer;
            ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            if (textarea.value && textarea.value.trim()) {
                console.log('✅ 简答题填充成功（通过textarea）');
                success = true;
            } else {
                console.log('❌ 简答题填充失败（textarea方法也失败）');
            }
        } else {
            console.log('未找到 textarea 元素');
        }
    }
    
    if (!success) {
        console.log('\n❌ 所有方法都失败，无法填充简答题');
    }
}

// 运行测试
testJiandaOnly();

