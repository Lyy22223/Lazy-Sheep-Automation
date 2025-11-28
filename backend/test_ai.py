"""
测试AI答题功能（DeepSeek）
"""
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8000"
ADMIN_KEY = "czbk_admin_2024_secret_key_change_in_production"

# 检查是否配置了AI API Key
ai_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY")
if not ai_key:
    print("警告: 未配置AI API Key，请先设置DEEPSEEK_API_KEY或AI_API_KEY")
    print("可以在.env文件中配置，或使用环境变量")
    exit(1)

print(f"使用AI服务: {os.getenv('AI_PROVIDER', 'deepseek')}")
print(f"API Key已配置: {ai_key[:10]}...")

# 生成或使用现有API Key
print("\n获取API Key...")
headers = {"X-Admin-Key": ADMIN_KEY}
response = requests.post(
    f"{BASE_URL}/api/admin/generate-key?plan=free",
    headers=headers
)
api_key = response.json()["data"]["api_key"]
print(f"API Key: {api_key}")

# 测试AI答题
print("\n测试AI答题功能...")
test_questions = [
    {
        "questionContent": "什么是Python？",
        "type": "4",  # 简答题
        "platform": "czbk"
    },
    {
        "questionContent": "下列哪个是Python的数据类型？",
        "type": "0",  # 单选题
        "options": ["A、int", "B、string", "C、number", "D、float"],
        "platform": "czbk"
    }
]

headers = {
    "X-API-Key": api_key,
    "Content-Type": "application/json"
}

for i, question in enumerate(test_questions, 1):
    print(f"\n题目 {i}: {question['questionContent']}")
    print("-" * 50)
    
    response = requests.post(
        f"{BASE_URL}/api/ai/answer",
        headers=headers,
        json=question
    )
    
    print(f"状态码: {response.status_code}")
    result = response.json()
    
    if result.get("code") == 1:
        data = result.get("data", {})
        print(f"答案: {data.get('answer', 'N/A')}")
        print(f"解析: {data.get('solution', 'N/A')[:100]}...")
        print(f"置信度: {data.get('confidence', 'N/A')}")
    else:
        print(f"错误: {result.get('message', '未知错误')}")
        print(f"完整响应: {json.dumps(result, indent=2, ensure_ascii=False)}")

print("\n" + "=" * 50)
print("AI答题测试完成！")
print("=" * 50)

