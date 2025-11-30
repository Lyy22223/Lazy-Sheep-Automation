"""
AI答题服务
"""
from openai import AsyncOpenAI
from api.config import get_settings
from loguru import logger

settings = get_settings()

# 初始化DeepSeek客户端
client = AsyncOpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url
)

# 题型Prompt模板
PROMPTS = {
    "0": """你是一个答题助手。请回答以下单选题（只选一个选项）。
直接返回答案选项的字母（A/B/C/D等），不要有任何解释。

题目：{question}

选项：
{options}

答案：""",
    
    "1": """你是一个答题助手。请回答以下多选题（至少选两个选项）。
直接返回答案选项的字母，用逗号分隔（如：A,B,D），不要有任何解释。

题目：{question}

选项：
{options}

答案：""",
    
    "2": """你是一个答题助手。请回答以下判断题。
直接返回"对"或"错"，不要有任何解释。

题目：{question}

答案：""",
    
    "3": """你是一个答题助手。请回答以下填空题。
直接返回答案文本，注意标准答案的格式（大小写、空格、标点）。

题目：{question}

{attempted_hint}

答案：""",
    
    "4": """你是一个答题助手。请回答以下简答题。
给出简洁准确的答案。

题目：{question}

答案："""
}


class AIService:
    """AI答题服务"""
    
    @staticmethod
    async def answer_question(
        content: str,
        question_type: str,
        options: list = None,
        model: str = None,
        attempted_answers: list = None
    ) -> dict:
        """使用AI生成答案"""
        try:
            # 选择模型
            if model is None:
                model = settings.deepseek_model
            
            # 构建prompt
            prompt_template = PROMPTS.get(question_type, PROMPTS["4"])
            
            # 格式化选项
            options_text = ""
            if options:
                options_text = "\n".join(options)
            
            # 已尝试答案提示
            attempted_hint = ""
            if attempted_answers and len(attempted_answers) > 0:
                attempted_hint = f"注意：以下答案已被证明错误，请避免：{', '.join(attempted_answers)}\n请给出标准答案，注意区分大小写、空格和标点符号。"
            
            prompt = prompt_template.format(
                question=content,
                options=options_text,
                attempted_hint=attempted_hint
            )
            
            # 调用AI
            logger.info(f"调用AI: model={model}, type={question_type}")
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "你是一个专业的答题助手。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # 降低随机性
                max_tokens=500
            )
            
            answer = response.choices[0].message.content.strip()
            
            # 清理答案
            answer = AIService._clean_answer(answer, question_type)
            
            logger.info(f"AI答案: {answer}")
            
            return {
                "answer": answer,
                "reasoning": "",  # 可选：添加推理过程
                "confidence": 0.85,
                "model": model,
                "tokens": response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            logger.error(f"AI答题失败: {e}")
            raise
    
    @staticmethod
    def _clean_answer(answer: str, question_type: str) -> str:
        """清理AI答案"""
        # 移除常见的前缀
        prefixes = ["答案：", "答案:", "Answer:", "答："]
        for prefix in prefixes:
            if answer.startswith(prefix):
                answer = answer[len(prefix):].strip()
        
        # 单选/多选：确保只有字母
        if question_type in ["0", "1"]:
            # 提取A-Z字母
            letters = [c for c in answer.upper() if c.isalpha() and 'A' <= c <= 'Z']
            if question_type == "0":
                # 单选：只取第一个
                answer = letters[0] if letters else answer
            else:
                # 多选：逗号分隔
                answer = ",".join(sorted(set(letters)))
        
        # 判断题：规范化
        elif question_type == "2":
            if any(word in answer for word in ["对", "正确", "true", "TRUE", "对的", "是"]):
                answer = "对"
            elif any(word in answer for word in ["错", "错误", "false", "FALSE", "不对", "否"]):
                answer = "错"
        
        return answer.strip()
