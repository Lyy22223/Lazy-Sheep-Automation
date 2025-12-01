-- 添加answers表用于多答案存储
-- 执行: psql -h localhost -U lazy_user -d lazy_sheep -f migrations/001_add_answers_table.sql

-- 创建answers表
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    
    -- 答案内容
    answer TEXT NOT NULL,
    answer_text TEXT,
    
    -- 来源信息
    source VARCHAR(20) NOT NULL,  -- auto_answer/platform_verified/correction/user
    contributor VARCHAR(64),      -- 贡献者ID或标识
    
    -- 质量评估
    confidence FLOAT DEFAULT 1.0,
    vote_count INTEGER DEFAULT 0,  -- 投票数（正票-负票）
    is_accepted BOOLEAN DEFAULT FALSE,  -- 是否为最佳答案
    
    -- 验证信息
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(64),
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_source ON answers(source);
CREATE INDEX IF NOT EXISTS idx_answers_is_accepted ON answers(is_accepted);
CREATE INDEX IF NOT EXISTS idx_answers_created_at ON answers(created_at);

-- 迁移现有数据：将questions表中的答案迁移到answers表
-- 只迁移有答案的题目
INSERT INTO answers (question_id, answer, answer_text, source, contributor, confidence, is_accepted, verified, created_at)
SELECT 
    id,
    answer,
    answer_text,
    source,
    'legacy_migration',  -- 标记为迁移数据
    confidence,
    TRUE,  -- 现有答案标记为最佳答案
    verified,
    created_at
FROM questions
WHERE answer IS NOT NULL AND answer != ''
ON CONFLICT DO NOTHING;

-- 添加注释
COMMENT ON TABLE answers IS '答案表 - 支持多答案存储';
COMMENT ON COLUMN answers.question_id IS '关联的题目ID';
COMMENT ON COLUMN answers.source IS '来源：auto_answer/platform_verified/correction/user';
COMMENT ON COLUMN answers.vote_count IS '投票数（正票-负票）';
COMMENT ON COLUMN answers.is_accepted IS '是否为最佳答案';

-- 显示结果
SELECT 
    '答案表创建成功' as status,
    COUNT(*) as migrated_answers 
FROM answers 
WHERE contributor = 'legacy_migration';
