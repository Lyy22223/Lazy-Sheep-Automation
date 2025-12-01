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
直接返回答案选项的字母（仅从给定选项中选择），不要有任何解释。

题目：{question}

选项：
{options}

注意：只能从上述选项中选择一个，不能选择其他字母。
答案：""",
    
    "1": """你是一个答题助手。请回答以下多选题（至少选两个选项）。
直接返回答案选项的字母，用逗号分隔（如：A,B,D），不要有任何解释。

题目：{question}

选项：
{options}

注意：只能从上述选项中选择，不能选择其他字母。
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
给出简洁准确的答案，要求：
1. 不要使用任何Markdown格式（不要加粗、不要列表、不要标题）
2. 使用纯文本，可以用分号或句号分隔要点
3. 每个要点之间最多一个换行，不要有连续空行
4. 保持简洁，避免冗余解释

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
            
            # 格式化选项并获取有效选项keys
            options_text = ""
            valid_keys = []
            if options:
                # 处理字典格式: [{key: "A", text: "..."}, ...]
                if isinstance(options[0], dict):
                    options_text = "\n".join([f"{opt['key']}. {opt['text']}" for opt in options])
                    valid_keys = [opt['key'] for opt in options]
                # 处理字符串格式: ["选项1", "选项2", ...]
                elif isinstance(options[0], str):
                    options_text = "\n".join([f"{chr(65+i)}. {opt}" for i, opt in enumerate(options)])
                    valid_keys = [chr(65+i) for i in range(len(options))]
                else:
                    options_text = "\n".join(str(opt) for opt in options)
            
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
            answer = AIService._clean_answer(answer, question_type, valid_keys)
            
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
    def _clean_answer(answer: str, question_type: str, valid_keys: list = None) -> str:
        """清理AI答案"""
        # 移除常见的前缀
        prefixes = ["答案：", "答案:", "Answer:", "答："]
        for prefix in prefixes:
            if answer.startswith(prefix):
                answer = answer[len(prefix):].strip()
        
        # 单选/多选：确保只有字母，并且在有效范围内
        if question_type in ["0", "1"]:
            # 提取A-Z字母
            letters = [c for c in answer.upper() if c.isalpha() and 'A' <= c <= 'Z']
            
            # 如果提供了有效选项，只保留有效的
            if valid_keys:
                letters = [c for c in letters if c in valid_keys]
            
            if question_type == "0":
                # 单选：只取第一个有效选项
                answer = letters[0] if letters else (valid_keys[0] if valid_keys else "A")
            else:
                # 多选：逗号分隔，至少2个
                if len(letters) < 2 and valid_keys and len(valid_keys) >= 2:
                    # 如果AI返回少于2个，取前2个有效选项作为默认
                    letters = valid_keys[:2]
                answer = ",".join(sorted(set(letters)))
        
        # 判断题：规范化
        elif question_type == "2":
            if any(word in answer for word in ["对", "正确", "true", "TRUE", "对的", "是"]):
                answer = "对"
            elif any(word in answer for word in ["错", "错误", "false", "FALSE", "不对", "否"]):
                answer = "错"
        
        # 填空题和简答题：清理格式
        elif question_type in ["3", "4"]:
            # 移除Markdown格式
            answer = AIService._remove_markdown(answer)
            
            # 清理连续换行，最多保留一个
            import re
            answer = re.sub(r'\n{2,}', '\n', answer)  # 多个换行替换为一个
            answer = re.sub(r'\n\s*\n', '\n', answer)  # 包含空白的多个换行
            
            # 移除行首的列表符号和数字
            lines = answer.split('\n')
            cleaned_lines = []
            for line in lines:
                # 移除数字列表（如 "1. "、"2. "）
                line = re.sub(r'^\d+\.\s*', '', line.strip())
                # 移除列表符号（如 "- "、"* "）
                line = re.sub(r'^[-*]\s*', '', line.strip())
                if line:  # 只保留非空行
                    cleaned_lines.append(line)
            
            answer = '\n'.join(cleaned_lines)
        
        return answer.strip()
    
    @staticmethod
    def _remove_markdown(text: str) -> str:
        """移除Markdown格式"""
        import re
        # 移除加粗 **text** 或 __text__
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'__(.+?)__', r'\1', text)
        # 移除斜体 *text* 或 _text_
        text = re.sub(r'\*(.+?)\*', r'\1', text)
        text = re.sub(r'_(.+?)_', r'\1', text)
        # 移除代码块 `code`
        text = re.sub(r'`(.+?)`', r'\1', text)
        # 移除标题符号 #
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
        return text
