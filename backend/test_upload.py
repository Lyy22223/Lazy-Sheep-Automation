"""
测试上传功能
"""
import requests
import json

BASE_URL = "http://localhost:8000"
ADMIN_KEY = "czbk_admin_2024_secret_key_change_in_production"

# 生成测试API Key
print("生成测试API Key...")
headers = {"X-Admin-Key": ADMIN_KEY}
response = requests.post(
    f"{BASE_URL}/api/admin/generate-key?plan=free",
    headers=headers
)
api_key = response.json()["data"]["api_key"]
print(f"API Key: {api_key}")

# 测试上传数据
print("\n测试上传题库数据...")
upload_data = {
    "data": {
        "resultObject": {
            "danxuan": {
                "lists": [
                    {
                        "id": "test_001",
                        "questionContent": "下列选项中，对于创建Maven项目时，Group和Artifact的描述正确的是？",
                        "options": [
                            "A、Group为项目的组名，通常使用公司域名倒写",
                            "B、Artifact为项目的名称",
                            "C、Artifact为所创建项目在本地存放的路径",
                            "D、Group和Artifact是Maven区分项目包的字段"
                        ]
                    }
                ]
            }
        }
    },
    "answerRecords": [
        {
            "questionId": "test_001",
            "type": "0",
            "questionContent": "下列选项中，对于创建Maven项目时，Group和Artifact的描述正确的是？",
            "answer": "A",
            "timestamp": 1234567890
        }
    ]
}

headers = {
    "X-API-Key": api_key,
    "Content-Type": "application/json"
}

response = requests.post(
    f"{BASE_URL}/api/upload",
    headers=headers,
    json=upload_data
)

print(f"状态码: {response.status_code}")
print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

# 再次搜索，应该能找到答案
print("\n再次搜索答案...")
search_data = {
    "questionContent": "下列选项中，对于创建Maven项目时，Group和Artifact的描述正确的是？",
    "type": "0",
    "options": [
        "A、Group为项目的组名，通常使用公司域名倒写",
        "B、Artifact为项目的名称",
        "C、Artifact为所创建项目在本地存放的路径",
        "D、Group和Artifact是Maven区分项目包的字段"
    ],
    "platform": "czbk"
}

response = requests.post(
    f"{BASE_URL}/api/search",
    headers=headers,
    json=search_data
)

print(f"状态码: {response.status_code}")
print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

# 检查统计信息
print("\n检查统计信息...")
response = requests.get(f"{BASE_URL}/api/stats", headers={"X-API-Key": api_key})
print(f"状态码: {response.status_code}")
print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

