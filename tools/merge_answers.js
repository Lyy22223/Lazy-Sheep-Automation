const fs = require('fs');
const path = require('path');

// 读取JSON文件
function readJSONFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
        return null;
    }
}

// 从solution中提取答案
function extractAnswerFromSolution(solution, questionType) {
    if (!solution || solution === '无') return null;

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
            return '错误';
        }
        if (solution.includes('正确') || solution.includes('对')) {
            return '正确';
        }
    }

    return null;
}

// 处理题目列表
function processQuestions(questions, questionType) {
    const result = [];
    
    questions.forEach(q => {
        const id = q.id || q.questionId;
        if (!id) return;

        let answer = null;

        // 如果已经是简单数组格式（已有答案）
        if (q.answer !== undefined && q.answer !== null && q.answer !== '') {
            answer = q.answer;
        } else {
            // 从solution中提取答案
            answer = extractAnswerFromSolution(q.solution, questionType);
        }

        // 如果没有答案，跳过
        if (!answer) return;

        // 多选题可能需要数组格式
        if (questionType === '1' && typeof answer === 'string') {
            // 如果是字符串，转换为数组
            answer = answer.toUpperCase().replace(/[,，\s]/g, '').split('').filter(a => a);
        }

        result.push({
            id: id,
            answer: answer
        });
    });

    return result;
}

// 主函数
function mergeAnswerFiles() {
    const files = [
        { path: 'danxuan.json', type: '0', name: '单选题' },
        { path: 'duoxuan.json', type: '1', name: '多选题' },
        { path: 'panduan.json', type: '2', name: '判断题' },
        { path: 'tiankong.json', type: '3', name: '填空题' },
        { path: 'jianda.json', type: '4', name: '简答题' }
    ];

    let allAnswers = [];

    files.forEach(file => {
        console.log(`处理 ${file.name}...`);
        const data = readJSONFile(file.path);
        
        if (!data) {
            console.log(`跳过 ${file.name}（文件读取失败）`);
            return;
        }

        // 检查是否是简单数组格式
        if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].answer !== undefined) {
            console.log(`  ${file.name} 已经是简单格式，直接合并 ${data.length} 条记录`);
            allAnswers = allAnswers.concat(data);
            return;
        }

        // 处理嵌套格式
        const result = data.resultObject || data;
        let questions = [];

        if (file.type === '0' && result.danxuan && result.danxuan.lists) {
            questions = result.danxuan.lists;
        } else if (file.type === '1' && result.duoxuan && result.duoxuan.lists) {
            questions = result.duoxuan.lists;
        } else if (file.type === '2' && result.panduan && result.panduan.lists) {
            questions = result.panduan.lists;
        } else if (file.type === '3' && result.tiankong && result.tiankong.lists) {
            questions = result.tiankong.lists;
        } else if (file.type === '4' && result.jieda && result.jieda.lists) {
            questions = result.jieda.lists;
        }

        if (questions.length === 0) {
            console.log(`  ${file.name} 未找到题目列表`);
            return;
        }

        const processed = processQuestions(questions, file.type);
        console.log(`  ${file.name} 处理完成，提取 ${processed.length} 条答案`);
        allAnswers = allAnswers.concat(processed);
    });

    // 保存合并后的文件
    const outputPath = 'merged_answers.json';
    fs.writeFileSync(outputPath, JSON.stringify(allAnswers, null, 2), 'utf-8');
    
    console.log(`\n合并完成！共 ${allAnswers.length} 条答案记录`);
    console.log(`已保存到: ${outputPath}`);
}

// 执行合并
mergeAnswerFiles();


