// 测试代码 - 直接在浏览器控制台运行

// 1. 找到一个题目元素
const item = document.querySelector('.questionItem');

if (!item) {
    console.log('❌ 未找到题目元素');
} else {
    console.log('✅ 找到题目元素:', item);
    
    // 2. 测试获取题目ID
    const questionId = item.getAttribute('data-id') || 
                       item.closest('[data-id]')?.getAttribute('data-id');
    console.log('题目ID:', questionId);
    
    // 3. 测试获取题目文本（模拟原脚本的逻辑）
    let titleBox = item.querySelector('.question-title-box .myEditorTxt');
    let questionText = '';
    
    if (titleBox) {
        questionText = titleBox.textContent.trim();
        console.log('✅ 方法1成功 - 题目文本:', questionText);
        console.log('题目文本长度:', questionText.length);
        console.log('题目HTML:', titleBox.innerHTML.substring(0, 200));
    } else {
        console.log('❌ 方法1失败，尝试方法2...');
        titleBox = item.querySelector('.question-title-box');
        if (titleBox) {
            questionText = titleBox.textContent.trim().replace(/^\d+[、.]\s*/, '');
            console.log('✅ 方法2成功 - 题目文本:', questionText);
        } else {
            console.log('❌ 所有方法都失败');
        }
    }
    
    // 4. 检查题目类型
    const parent = item.closest('#danxuanQuestionBox, #duoxuanQuestionBox, #panduanQuestionBox, #tiankongQuestionBox, #jiandaQuestionBox');
    const questionType = parent ? 
        (parent.id === 'danxuanQuestionBox' ? '0' : 
         parent.id === 'duoxuanQuestionBox' ? '1' : 
         parent.id === 'panduanQuestionBox' ? '2' : 
         parent.id === 'tiankongQuestionBox' ? '3' : '4') : 'unknown';
    console.log('题目类型:', questionType, parent?.id);
    
    // 5. 检查是否已答
    const hasRadio = item.querySelector('input[type="radio"]:checked');
    const hasCheckbox = item.querySelector('input[type="checkbox"]:checked');
    const fillInputs = item.querySelectorAll('input.tk_input[data-questionid]');
    let hasFill = false;
    for (const input of fillInputs) {
        if (input.value && input.value.trim()) {
            hasFill = true;
            break;
        }
    }
    console.log('是否已答:', !!(hasRadio || hasCheckbox || hasFill), {
        hasRadio: !!hasRadio,
        hasCheckbox: !!hasCheckbox,
        hasFill: hasFill
    });
    
    // 6. 显示完整的题目结构信息
    console.log('\n=== 题目结构分析 ===');
    console.log('题目元素:', item);
    console.log('题目ID属性:', item.getAttribute('data-id'));
    console.log('题目标题容器:', item.querySelector('.question-title-box'));
    console.log('题目文本容器:', item.querySelector('.question-title-box .myEditorTxt'));
    console.log('选项容器:', item.querySelector('.option, .question-option-box'));
    console.log('单选按钮数量:', item.querySelectorAll('input[type="radio"]').length);
    console.log('多选按钮数量:', item.querySelectorAll('input[type="checkbox"]').length);
    console.log('填空输入框数量:', item.querySelectorAll('input.tk_input').length);
}

// ===== 随机填充测试 =====
// 在控制台运行这段代码来测试随机填充
async function testRandomFill() {
    console.log('=== 开始随机填充测试 ===\n');
    
    // 1. 找到所有未答的单选题
    const allItems = Array.from(document.querySelectorAll('#danxuanQuestionBox .questionItem'));
    const unansweredItems = allItems.filter(item => {
        const hasAnswer = item.querySelector('input[type="radio"]:checked');
        return !hasAnswer;
    });
    
    console.log(`总共 ${allItems.length} 道题，未答 ${unansweredItems.length} 道`);
    
    if (unansweredItems.length === 0) {
        console.log('❌ 没有未答题，无法测试');
        return;
    }
    
    // 2. 选择第一道未答题进行测试
    const testItem = unansweredItems[0];
    const questionId = testItem.getAttribute('data-id');
    console.log(`\n测试题目ID: ${questionId}`);
    
    // 3. 获取所有选项
    const radioInputs = Array.from(testItem.querySelectorAll('input[type="radio"]'));
    console.log(`找到 ${radioInputs.length} 个选项`);
    
    if (radioInputs.length === 0) {
        console.log('❌ 未找到选项');
        return;
    }
    
    // 4. 随机选择一个选项
    const randomIndex = Math.floor(Math.random() * radioInputs.length);
    const randomRadio = radioInputs[randomIndex];
    const randomValue = randomRadio.value;
    
    console.log(`随机选择: 选项 ${randomIndex + 1}，值: "${randomValue}"`);
    
    // 5. 尝试填充
    console.log('\n开始填充...');
    
    try {
        // 方法1: 直接点击radio
        console.log('方法1: 直接点击radio元素');
        randomRadio.click();
        
        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 检查是否选中
        if (randomRadio.checked) {
            console.log('✅ 方法1成功: radio已选中');
        } else {
            console.log('❌ 方法1失败: radio未选中，尝试方法2...');
            
            // 方法2: 通过Element Plus的label点击
            const label = randomRadio.closest('label.el-radio');
            if (label) {
                console.log('方法2: 点击Element Plus label');
                label.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (randomRadio.checked) {
                    console.log('✅ 方法2成功: radio已选中');
                } else {
                    console.log('❌ 方法2失败');
                }
            }
        }
        
        // 方法3: 设置checked属性并触发事件
        if (!randomRadio.checked) {
            console.log('方法3: 设置checked属性并触发事件');
            randomRadio.checked = true;
            randomRadio.dispatchEvent(new Event('change', { bubbles: true }));
            randomRadio.dispatchEvent(new Event('click', { bubbles: true }));
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (randomRadio.checked) {
                console.log('✅ 方法3成功: radio已选中');
            } else {
                console.log('❌ 方法3失败');
            }
        }
        
        // 最终检查
        const finalChecked = testItem.querySelector('input[type="radio"]:checked');
        if (finalChecked) {
            console.log(`\n✅ 填充成功！最终选中: "${finalChecked.value}"`);
        } else {
            console.log('\n❌ 填充失败：没有选项被选中');
        }
        
    } catch (e) {
        console.error('填充过程出错:', e);
    }
}

// 运行测试
// testRandomFill();
