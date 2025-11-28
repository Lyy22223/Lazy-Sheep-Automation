"""
API测试脚本
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"
ADMIN_KEY = "czbk_admin_2024_secret_key_change_in_production"

def test_health():
    """测试健康检查"""
    print("=" * 50)
    print("测试1: 健康检查")
    print("=" * 50)
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"状态码: {response.status_code}")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_root():
    """测试根路径"""
    print("\n" + "=" * 50)
    print("测试2: 根路径")
    print("=" * 50)
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"状态码: {response.status_code}")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_generate_api_key():
    """测试生成API Key"""
    print("\n" + "=" * 50)
    print("测试3: 生成API Key")
    print("=" * 50)
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        response = requests.post(
            f"{BASE_URL}/api/admin/generate-key?plan=free",
            headers=headers
        )
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        if result.get("code") == 1:
            api_key = result["data"]["api_key"]
            print(f"\n生成的API Key: {api_key}")
            return api_key
        return None
    except Exception as e:
        print(f"错误: {e}")
        return None

def test_get_key_info(api_key):
    """测试获取API Key信息"""
    print("\n" + "=" * 50)
    print("测试4: 获取API Key信息")
    print("=" * 50)
    try:
        headers = {"X-API-Key": api_key}
        response = requests.get(f"{BASE_URL}/api/key/info", headers=headers)
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_search(api_key):
    """测试搜索答案"""
    print("\n" + "=" * 50)
    print("测试5: 搜索答案")
    print("=" * 50)
    try:
        headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }
        data = {
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
            json=data
        )
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_stats(api_key):
    """测试获取统计信息"""
    print("\n" + "=" * 50)
    print("测试6: 获取统计信息")
    print("=" * 50)
    try:
        headers = {"X-API-Key": api_key}
        response = requests.get(f"{BASE_URL}/api/stats", headers=headers)
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"错误: {e}")
        return False

def main():
    """主测试函数"""
    print("\n" + "=" * 50)
    print("开始API测试")
    print("=" * 50)
    
    # 等待服务启动
    print("\n等待服务启动...")
    time.sleep(2)
    
    # 测试1: 健康检查
    if not test_health():
        print("\n服务未启动，请先启动服务！")
        return
    
    # 测试2: 根路径
    test_root()
    
    # 测试3: 生成API Key
    api_key = test_generate_api_key()
    if not api_key:
        print("\n无法生成API Key，测试终止")
        return
    
    # 测试4: 获取Key信息
    test_get_key_info(api_key)
    
    # 测试5: 搜索答案
    test_search(api_key)
    
    # 测试6: 获取统计信息
    test_stats(api_key)
    
    print("\n" + "=" * 50)
    print("测试完成！")
    print("=" * 50)

if __name__ == "__main__":
    main()

