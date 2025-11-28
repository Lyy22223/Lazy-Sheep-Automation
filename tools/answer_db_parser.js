/**
 * 题目答案数据库解析工具
 * 从 index.json 中提取题目和答案，生成可用于油猴脚本的答案数据库
 */

const fs = require('fs');

function parseAnswerDatabase(jsonPath) {
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const result = jsonData.resultObject;
    
    const answerDB = {
        danxuan: [],  // 单选题
        duoxuan: [],  // 多选题
        panduan: [],  // 判断题
        tiankong: [], // 填空题
        jieda: []     // 解答题
    };
    
    // 解析单选题
    if (result.danxuan && result.danxuan.lists) {
        result.danxuan.lists.forEach(q => {
            answerDB.danxuan.push({
                questionId: q.questionId,
                questionContent: q.questionContent,
                questionContentText: q.questionContentText,
                options: q.questionOptionList || [],
                solution: q.solution || '',
                answer: q.answer || '',
                type: '0'
            });
        });
    }
    
    // 解析多选题
    if (result.duoxuan && result.duoxuan.lists) {
        result.duoxuan.lists.forEach(q => {
            answerDB.duoxuan.push({
                questionId: q.questionId,
                questionContent: q.questionContent,
                questionContentText: q.questionContentText,
                options: q.questionOptionList || [],
                solution: q.solution || '',
                answer: q.answer || '',
                type: '1'
            });
        });
    }
    
    // 解析判断题
    if (result.panduan && result.panduan.lists) {
        result.panduan.lists.forEach(q => {
            answerDB.panduan.push({
                questionId: q.questionId,
                questionContent: q.questionContent,
                questionContentText: q.questionContentText,
                solution: q.solution || '',
                answer: q.answer || '',
                type: '2'
            });
        });
    }
    
    // 解析填空题
    if (result.tiankong && result.tiankong.lists) {
        result.tiankong.lists.forEach(q => {
            answerDB.tiankong.push({
                questionId: q.questionId,
                questionContent: q.questionContent,
                questionContentText: q.questionContentText,
                solution: q.solution || '',
                answer: q.answer || '',
                type: '3'
            });
        });
    }
    
    // 解析解答题
    if (result.jieda && result.jieda.lists) {
        result.jieda.lists.forEach(q => {
            answerDB.jieda.push({
                questionId: q.questionId,
                questionContent: q.questionContent,
                questionContentText: q.questionContentText,
                solution: q.solution || '',
                answer: q.answer || '',
                type: '4'
            });
        });
    }
    
    return answerDB;
}

// 从solution中提取答案（尝试解析）
function extractAnswerFromSolution(question) {
    const solution = question.solution || '';
    const questionContent = question.questionContent || '';
    
    // 尝试从solution中提取答案
    // 方法1: 查找"答案是"、"正确答案是"等关键词
    const answerPatterns = [
        /答案是[：:]\s*([A-Z]+)/i,
        /正确答案是[：:]\s*([A-Z]+)/i,
        /应该选择[：:]\s*([A-Z]+)/i,
        /选择[：:]\s*([A-Z]+)/i
    ];
    
    for (const pattern of answerPatterns) {
        const match = solution.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    // 方法2: 对于判断题，从solution中判断是"正确"还是"错误"
    if (question.type === '2') {
        if (solution.includes('错误') || solution.includes('不正确') || solution.includes('不对')) {
            return '错误';
        }
        if (solution.includes('正确') || solution.includes('对')) {
            return '正确';
        }
    }
    
    return null;
}

// 生成答案数据库（用于嵌入到油猴脚本中）
function generateAnswerDB(answerDB) {
    const db = {};
    
    // 为每个题目创建索引
    answerDB.danxuan.forEach(q => {
        const key = q.questionContentText || q.questionContent;
        if (key) {
            db[key] = {
                type: '0',
                answer: extractAnswerFromSolution(q) || q.answer,
                solution: q.solution,
                options: q.options
            };
        }
    });
    
    answerDB.duoxuan.forEach(q => {
        const key = q.questionContentText || q.questionContent;
        if (key) {
            db[key] = {
                type: '1',
                answer: extractAnswerFromSolution(q) || q.answer,
                solution: q.solution,
                options: q.options
            };
        }
    });
    
    answerDB.panduan.forEach(q => {
        const key = q.questionContentText || q.questionContent;
        if (key) {
            db[key] = {
                type: '2',
                answer: extractAnswerFromSolution(q) || q.answer,
                solution: q.solution
            };
        }
    });
    
    return db;
}

// 主函数
function main() {
    try {
        const answerDB = parseAnswerDatabase('./index.json');
        const db = generateAnswerDB(answerDB);
        
        // 输出统计信息
        console.log('题目统计:');
        console.log(`单选题: ${answerDB.danxuan.length}`);
        console.log(`多选题: ${answerDB.duoxuan.length}`);
        console.log(`判断题: ${answerDB.panduan.length}`);
        console.log(`填空题: ${answerDB.tiankong.length}`);
        console.log(`解答题: ${answerDB.jieda.jieda}`);
        
        // 保存答案数据库
        fs.writeFileSync('answer_db.json', JSON.stringify(db, null, 2));
        console.log('\n答案数据库已保存到 answer_db.json');
        
        // 生成用于油猴脚本的JS代码
        const jsCode = `// 题目答案数据库\nconst ANSWER_DB = ${JSON.stringify(db, null, 2)};`;
        fs.writeFileSync('answer_db.js', jsCode);
        console.log('答案数据库JS文件已保存到 answer_db.js');
        
    } catch (error) {
        console.error('处理失败:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = { parseAnswerDatabase, extractAnswerFromSolution, generateAnswerDB };

