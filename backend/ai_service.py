"""
AI答题服务模块
支持OpenAI和DeepSeek
"""
import sys
import io
# 设置标准输出编码为UTF-8，避免乱码
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from typing import Optional, List, Dict
import re
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)
from config import (
    AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL,
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL,
    DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
)


# 初始化AI客户端
client = None
current_model = None

def init_ai_client():
    """初始化AI客户端"""
    global client, current_model
    
    # 优先使用新的统一配置
    if AI_PROVIDER.lower() == "deepseek":
        api_key = AI_API_KEY or DEEPSEEK_API_KEY
        base_url = AI_BASE_URL or DEEPSEEK_BASE_URL
        model = AI_MODEL or DEEPSEEK_MODEL
    elif AI_PROVIDER.lower() == "openai":
        api_key = AI_API_KEY or OPENAI_API_KEY
        base_url = AI_BASE_URL or OPENAI_BASE_URL
        model = AI_MODEL or OPENAI_MODEL
    else:
        # 默认使用DeepSeek
        api_key = DEEPSEEK_API_KEY or OPENAI_API_KEY
        base_url = DEEPSEEK_BASE_URL if DEEPSEEK_API_KEY else OPENAI_BASE_URL
        model = DEEPSEEK_MODEL if DEEPSEEK_API_KEY else OPENAI_MODEL
    
    if api_key:
        client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        current_model = model
        logger.info(f"AI服务已初始化: {AI_PROVIDER or 'auto'} ({model})")
    else:
        logger.warning("未配置AI API Key，AI答题功能将不可用")

# 初始化客户端
init_ai_client()


async def ai_answer_question(
    question: str,
    question_type: str,
    options: Optional[List[str]] = None,
    platform: str = "czbk",
    model: Optional[str] = None
) -> Dict:
    """
    使用AI回答题目
    
    Args:
        question: 题目内容
        question_type: 题目类型（0=单选, 1=多选, 2=判断, 3=填空, 4=简答）
        options: 选项列表（选择题）
        platform: 平台标识
        model: 可选的模型名称，如果提供则使用指定的模型，否则使用默认模型
    
    Returns:
        包含答案和解析的字典
    """
    logger.info(f"收到AI答题请求: question_type={question_type}, model={model}, platform={platform}")
    logger.info(f"题目内容: {question[:100]}...")
    if options:
        logger.info(f"选项数量: {len(options)}")
    
    if not client:
        logger.error("AI服务未配置，请设置DEEPSEEK_API_KEY或OPENAI_API_KEY")
        raise Exception("AI服务未配置，请设置DEEPSEEK_API_KEY或OPENAI_API_KEY")
    
    # 确定使用的模型
    use_model = model or current_model
    logger.info(f"使用模型: {use_model} (请求模型: {model}, 默认模型: {current_model})")
    
    if not use_model:
        logger.error("未指定AI模型，请配置DEEPSEEK_MODEL或OPENAI_MODEL")
        raise Exception("未指定AI模型，请配置DEEPSEEK_MODEL或OPENAI_MODEL")
    
    # 验证模型名称格式（支持DeepSeek、OpenAI和其他兼容OpenAI API的模型）
    # DeepSeek模型（都已升级为DeepSeek-V3.2-Exp）:
    #   - deepseek-chat: DeepSeek-V3.2-Exp 非思考模式，快速响应（默认）
    #   - deepseek-reasoner: DeepSeek-V3.2-Exp 思考模式，深度推理
    # OpenAI模型: gpt-3.5-turbo, gpt-4, gpt-4-turbo 等
    # 其他兼容模型: 允许使用，但记录日志
    valid_prefixes = ('deepseek-', 'gpt-', 'claude-', 'o1-', 'qwen-', 'moonshot-')
    
    if not any(use_model.startswith(prefix) for prefix in valid_prefixes):
        logger.info(f"使用自定义模型: {use_model}，确保该模型兼容OpenAI API格式")
    
    # 记录使用的模型信息
    if use_model == 'deepseek-chat':
        logger.info(f"使用DeepSeek-V3.2-Exp (非思考模式，快速响应)")
    elif use_model == 'deepseek-reasoner':
        logger.info(f"使用DeepSeek-V3.2-Exp (思考模式，深度推理)")
    else:
        logger.info(f"使用模型: {use_model}")
    
    # 构建提示词
    prompt = build_prompt(question, question_type, options, platform)
    
    try:
        logger.info(f"开始调用AI API: model={use_model}, base_url={client.base_url if hasattr(client, 'base_url') else 'N/A'}")
        # 调用AI API（兼容OpenAI和DeepSeek）
        response = client.chat.completions.create(
            model=use_model,
            messages=[
                {
                    "role": "system",
                    "content": "你是一个专业的在线教育答题助手，擅长回答各种类型的题目。请准确、简洁地回答题目，并提供清晰的解析。"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,  # 降低温度以获得更确定的答案
            max_tokens=2000  # 简答题需要更多token来返回完整答案
        )
        
        logger.info(f"AI API调用成功，收到响应")
        answer_text = response.choices[0].message.content.strip()
        logger.info(f"AI返回答案文本: {answer_text[:200]}...")
        
        # 解析AI返回的答案
        parsed_answer = parse_ai_answer(answer_text, question_type, options)
        logger.info(f"解析后的答案: {parsed_answer['answer']}")
        
        return {
            "answer": parsed_answer["answer"],
            "solution": parsed_answer.get("solution", answer_text),
            "confidence": 0.8,  # AI答案的置信度
            "source": "ai",
            "model": use_model  # 返回使用的模型信息，方便前端显示
        }
    except Exception as e:
        logger.error(f"AI答题失败: {str(e)}", exc_info=True)
        logger.error(f"错误类型: {type(e).__name__}")
        if hasattr(e, 'status_code'):
            logger.error(f"HTTP状态码: {e.status_code}")
        if hasattr(e, 'response'):
            logger.error(f"响应内容: {e.response}")
        raise Exception(f"AI答题失败: {str(e)}")


def build_prompt(question: str, question_type: str, options: Optional[List[str]], platform: str) -> str:
    """构建AI提示词"""
    type_map = {
        "0": "单选题",
        "1": "多选题",
        "2": "判断题",
        "3": "填空题",
        "4": "简答题"
    }
    
    type_name = type_map.get(question_type, "题目")
    
    prompt = f"请回答以下{type_name}：\n\n题目：{question}\n\n"
    
    if options:
        prompt += "选项：\n"
        for i, opt in enumerate(options):
            prompt += f"{chr(65 + i)}. {opt}\n"
        prompt += "\n"
    
    if question_type in ["0", "1"]:
        prompt += "请直接给出答案选项（如：A、B、AB等），不要添加任何前缀标记。答案后可以换行提供简要解析。"
    elif question_type == "2":
        prompt += "请直接给出答案（正确或错误），不要添加任何前缀标记。答案后可以换行提供简要解析。"
    elif question_type == "3":
        prompt += "请直接给出填空答案，不要添加任何前缀标记。答案后可以换行提供简要解析。"
    elif question_type == "4":
        # 简答题需要完整答案，不要截断，且不能使用markdown格式
        prompt += "请直接给出完整答案，要求：\n"
        prompt += "1. 不要使用任何markdown格式标记（如**、#、```、-、*等），只能使用纯文本格式\n"
        prompt += "2. 不要使用\"答案：\"、\"**答案：**\"等前缀标记，直接开始回答内容\n"
        prompt += "3. 使用段落格式，在合适的地方使用换行符分隔段落\n"
        prompt += "4. 答案要完整、准确，不要截断\n"
        prompt += "5. 保持简洁明了，重点突出"
    else:
        prompt += "请直接给出答案，不要添加任何前缀标记。答案后可以换行提供简要解析。"
    
    return prompt


def parse_ai_answer(answer_text: str, question_type: str, options: Optional[List[str]]) -> Dict:
    """
    解析AI返回的答案
    
    返回格式：
    {
        "answer": "答案",
        "solution": "解析"
    }
    """
    # 尝试提取答案和解析
    # AI返回格式可能是：
    # "答案：A\n解析：..."
    # "A\n\n解析：..."
    # "A"
    # "**答案：**\n内容..."
    
    answer = ""
    solution = ""
    
    # 清理答案文本：移除常见的前缀标记和markdown格式
    cleaned_text = answer_text.strip()
    # 移除markdown格式的"**答案：**"、"**答案**"等
    cleaned_text = re.sub(r'\*\*答案[：:]\*\*\s*', '', cleaned_text, flags=re.IGNORECASE)
    cleaned_text = re.sub(r'\*\*答案\*\*\s*', '', cleaned_text, flags=re.IGNORECASE)
    cleaned_text = re.sub(r'^答案[：:]\s*', '', cleaned_text, flags=re.IGNORECASE)
    
    # 如果是简答题，移除所有markdown格式标记
    if question_type == "4":
        # 移除markdown加粗标记 **text** 或 __text__
        cleaned_text = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned_text)
        cleaned_text = re.sub(r'__([^_]+)__', r'\1', cleaned_text)
        # 移除markdown斜体标记 *text* 或 _text_
        cleaned_text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', cleaned_text)
        cleaned_text = re.sub(r'(?<!_)_([^_]+)_(?!_)', r'\1', cleaned_text)
        # 移除markdown标题标记 # ## ### 等
        cleaned_text = re.sub(r'^#{1,6}\s+', '', cleaned_text, flags=re.MULTILINE)
        # 移除markdown代码块标记 ``` 或 `
        cleaned_text = re.sub(r'```[\s\S]*?```', '', cleaned_text)
        cleaned_text = re.sub(r'`([^`]+)`', r'\1', cleaned_text)
        # 移除markdown列表标记 - * 或数字列表（但保留列表内容）
        cleaned_text = re.sub(r'^[\s]*[-*+]\s+', '', cleaned_text, flags=re.MULTILINE)
        cleaned_text = re.sub(r'^\d+\.\s+', '', cleaned_text, flags=re.MULTILINE)
        # 移除markdown链接和图片标记 [text](url) 或 ![alt](url)
        cleaned_text = re.sub(r'!?\[([^\]]+)\]\([^\)]+\)', r'\1', cleaned_text)
        # 移除所有连续空白行（2个或更多换行），统一为单个换行
        cleaned_text = re.sub(r'\n{2,}', '\n', cleaned_text)
        # 清理行首行尾空白
        lines = cleaned_text.split('\n')
        result_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped:  # 非空行，保留内容
                result_lines.append(stripped)
        # 用单个换行连接所有行（段落之间没有空行）
        cleaned_text = '\n'.join(result_lines)
        # 移除开头和结尾的空白
        cleaned_text = cleaned_text.strip()
    
    cleaned_text = cleaned_text.strip()
    
    # 查找答案部分
    if question_type in ["0", "1"]:  # 选择题
        # 提取选项字母
        match = re.search(r'[A-Z]+', cleaned_text)
        if match:
            answer = match.group()
        else:
            # 如果没有找到，取第一行作为答案
            lines = cleaned_text.split('\n')
            answer = lines[0].strip()
    elif question_type == "2":  # 判断题
        if "正确" in cleaned_text or "对" in cleaned_text:
            answer = "正确"
        elif "错误" in cleaned_text or "错" in cleaned_text:
            answer = "错误"
        else:
            answer = cleaned_text.split('\n')[0].strip()
    elif question_type == "3":  # 填空题
        # 取第一段作为答案
        lines = cleaned_text.split('\n')
        answer = lines[0].strip()
    else:  # 简答题（type=4）
        # 简答题需要保留完整答案内容
        # 移除"解析："、"说明："之后的内容作为解析，之前的内容作为答案
        if "解析" in cleaned_text or "说明" in cleaned_text:
            # 查找"解析："或"说明："的位置
            parts = re.split(r'解析[：:]|说明[：:]', cleaned_text, maxsplit=1)
            if len(parts) > 1:
                answer = parts[0].strip()
                solution = parts[1].strip()
            else:
                answer = cleaned_text
                solution = cleaned_text
        else:
            # 如果没有解析标记，整个内容作为答案
            answer = cleaned_text
            solution = cleaned_text
    
    # 如果答案为空，使用原始文本
    if not answer or answer == "":
        answer = cleaned_text if cleaned_text else answer_text
    
    # 提取解析部分（如果还没有设置）
    if not solution or solution == "":
        if "解析" in answer_text or "说明" in answer_text:
            parts = re.split(r'解析[：:]|说明[：:]', answer_text, maxsplit=1)
            if len(parts) > 1:
                solution = parts[1].strip()
            else:
                solution = answer_text
        else:
            solution = answer_text
    
    return {
        "answer": answer,
        "solution": solution
    }

