-- 创建测试API密钥
-- 在DBeaver中执行此SQL

-- 方式1: 使用固定的测试密钥（方便记忆）
INSERT INTO api_keys (
    key,
    user_id,
    name,
    usage_count,
    quota_daily,
    quota_monthly,
    is_active,
    expire_at
) VALUES (
    'sk-test-lazy-sheep-dev-2024',  -- 固定的测试密钥
    'dev_user',
    '开发测试密钥',
    0,
    99999,      -- 每日99999次
    9999999,    -- 每月9999999次
    true,
    NOW() + INTERVAL '365 days'  -- 1年后过期
);

-- 方式2: 生成随机密钥（更安全）
INSERT INTO api_keys (
    key,
    user_id,
    name,
    usage_count,
    quota_daily,
    quota_monthly,
    is_active,
    expire_at
) VALUES (
    'sk-' || encode(gen_random_bytes(32), 'hex'),  -- 随机生成
    'dev_user',
    '开发随机密钥',
    0,
    99999,
    9999999,
    true,
    NOW() + INTERVAL '365 days'
);

-- 查看创建的密钥
SELECT 
    id,
    key,
    name,
    user_id,
    quota_daily,
    quota_monthly,
    is_active,
    expire_at,
    created_at
FROM api_keys
ORDER BY created_at DESC;
