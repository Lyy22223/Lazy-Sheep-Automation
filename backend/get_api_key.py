"""
生成API Key脚本
"""
import requests
import json

BASE_URL = "http://localhost:8000"
ADMIN_KEY = "czbk_admin_2024_secret_key_change_in_production"

headers = {"X-Admin-Key": ADMIN_KEY}

print("=" * 60)
print("生成API Key")
print("=" * 60)

# 生成免费版
print("\n1. 免费版 (每日50次):")
response = requests.post(
    f"{BASE_URL}/api/admin/generate-key?plan=free",
    headers=headers
)
result = response.json()
if result["code"] == 1:
    api_key = result["data"]["api_key"]
    print(f"   API Key: {api_key}")
    print(f"   每日限制: {result['data']['daily_limit']} 次")

# 生成标准版
print("\n2. 标准版 (每日500次):")
response = requests.post(
    f"{BASE_URL}/api/admin/generate-key?plan=standard&expires_days=30",
    headers=headers
)
result = response.json()
if result["code"] == 1:
    api_key = result["data"]["api_key"]
    print(f"   API Key: {api_key}")
    print(f"   每日限制: {result['data']['daily_limit']} 次")

# 生成高级版
print("\n3. 高级版 (每日2000次):")
response = requests.post(
    f"{BASE_URL}/api/admin/generate-key?plan=premium&expires_days=30",
    headers=headers
)
result = response.json()
if result["code"] == 1:
    api_key = result["data"]["api_key"]
    print(f"   API Key: {api_key}")
    print(f"   每日限制: {result['data']['daily_limit']} 次")

print("\n" + "=" * 60)
print("使用方式:")
print("在HTTP请求头中添加: X-API-Key: <你的API Key>")
print("=" * 60)

