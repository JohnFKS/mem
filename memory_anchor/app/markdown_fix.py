"""Markdown 粘贴格式修正

借鉴 siyuan-plugin-text-process 的粘贴处理逻辑 (https://github.com/Achuan-2/
siyuan-plugin-text-process), 把"从外部复制进来的脏 Markdown"规整为干净的
Markdown。所有转换都是可选开关, 默认仅启用安全的子集:

- normalize          : 统一换行符 (CRLF/CR -> LF), 去除行尾空白
- latex_math        : 把 LaTeX 公式 \\[...\\] -> $$...$$ , \\(...\\) -> $...$ (跳过代码块/行内代码)
- bullet_to_list    : 把富文本项目符号 •○▪▫◆◇… 转成 Markdown 的 "- "
- collapse_blank    : 折叠 3 个及以上连续换行为一个空行
- remove_newlines   : 去换行 (按段落合并, 默认关, 破坏性较强)
- remove_spaces     : 去除所有空白 (保留换行, 默认关)
- add_paragraph_blank : 段间补空行 (默认关)
- fullwidth_to_halfwidth : 全角转半角 (默认关)

用法:
    from app.markdown_fix import fix_markdown
    fixed = fix_markdown(text)                       # 使用默认安全子集
    fixed = fix_markdown(text, {"remove_newlines": True})
"""

import re

# 富文本常见的项目符号 (Word/PPT/网页复制而来)
_BULLET_RE = re.compile(
    r"^(\s*)[•○▪▫◆◇►▻❖✦✴✿❀⚪■☐🔲✨✅⭐💡⚡•]\s*"
)

# 围栏代码块 (``` 或 ~~~, 允许前导空格)
_FENCED_CODE_LINE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
# 行内代码 (成对的反引号)
_INLINE_CODE = re.compile(r"(`+)([\s\S]*?)\1")


DEFAULT_OPTIONS = {
    "normalize": True,
    "latex_math": True,
    "bullet_to_list": True,
    "collapse_blank": True,
    "remove_newlines": False,
    "remove_spaces": False,
    "add_paragraph_blank": False,
    "fullwidth_to_halfwidth": False,
}


# --------------------------------------------------------------------------- #
# LaTeX 公式转换 (移植自 siyuan 的 latex-converter.ts)
# --------------------------------------------------------------------------- #
def _normalize_formula(formula: str, single_line: bool = False) -> str:
    trimmed = (formula or "").strip()
    if single_line:
        return trimmed.replace("\r\n", "").replace("\n", "")
    return trimmed


def _convert_math(text: str, inline_all: bool = False) -> str:
    def display_repl(m: re.Match) -> str:
        formula = _normalize_formula(m.group(1), inline_all)
        if not formula:
            return m.group(0)
        if inline_all:
            return f"${formula}$"
        start, end = m.start(), m.end()
        before = text[start - 1] if start > 0 else ""
        after = text[end] if end < len(text) else ""
        leading = "" if before and before not in "\n\r" else "\n"
        trailing = "" if after and after not in "\n\r" else "\n"
        return f"{leading}$$\n{formula}\n$${trailing}"

    text = re.sub(r"(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]", display_repl, text)

    def inline_repl(m: re.Match) -> str:
        formula = _normalize_formula(m.group(1), inline_all)
        return f"${formula}$" if formula else m.group(0)

    text = re.sub(r"(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)", inline_repl, text)

    if inline_all:
        def ddisplay_repl(m: re.Match) -> str:
            formula = _normalize_formula(m.group(1), True)
            return f"${formula}$" if formula else m.group(0)

        text = re.sub(r"(?<!\$)\$\$([\s\S]*?)\$\$(?!\$)", ddisplay_repl, text)

    return text


def _convert_outside_inline_code(text: str, inline_all: bool = False) -> str:
    out = []
    last = 0
    for m in _INLINE_CODE.finditer(text):
        out.append(_convert_math(text[last : m.start()], inline_all))
        out.append(m.group(0))
        last = m.end()
    out.append(_convert_math(text[last:], inline_all))
    return "".join(out)


def _convert_latex_math(text: str, inline_all: bool = False) -> str:
    lines = text.split("\n")
    output: list[str] = []
    plain: list[str] = []
    fence = ""  # 当前围栏字符 (``` 或 ~~~ 的首字符)
    fence_len = 0

    for line in lines:
        fm = _FENCED_CODE_LINE.match(line)
        if not fence:
            if fm:
                # 遇到代码块开始: 先把之前累积的普通文本做公式转换
                output.append(_convert_outside_inline_code("\n".join(plain), inline_all))
                plain = []
                fence = fm.group(1)[0]
                fence_len = len(fm.group(1))
                output.append(line)
                continue
            plain.append(line)
            continue
        # 处于代码块内: 原样保留, 不转换公式
        output.append(line)
        if fm:
            cm = fm.group(1)
            if cm[0] == fence and len(cm) >= fence_len:
                fence, fence_len = "", 0
        continue

    if plain:
        output.append(_convert_outside_inline_code("\n".join(plain), inline_all))
    return "\n".join(output)


# --------------------------------------------------------------------------- #
# 其余转换
# --------------------------------------------------------------------------- #
def _bullet_to_list(text: str) -> str:
    out = []
    for line in text.split("\n"):
        m = _BULLET_RE.match(line)
        if m:
            # 保留原有缩进 (从而保留多级列表层级), 仅替换项目符号
            out.append(m.group(1) + "- " + line[m.end():])
        else:
            out.append(line)
    return "\n".join(out)


def _fullwidth_to_halfwidth(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if (0x2000 <= code <= 0x200B) or code in (0x202F, 0x205F, 0x3000):
            out.append(" ")
        elif 0xFF01 <= code <= 0xFF5E or 0xFF10 <= code <= 0xFF19:
            out.append(chr(code - 0xFEE0))
        else:
            out.append(ch)
    return "".join(out)


# --------------------------------------------------------------------------- #
# 组合入口
# --------------------------------------------------------------------------- #
def fix_markdown(text, options=None) -> str:
    """对 Markdown 文本做粘贴格式修正。

    options 为可选字典, 键同 DEFAULT_OPTIONS。未提供的键使用默认值。
    """
    if text is None:
        return ""
    text = str(text)

    opts = dict(DEFAULT_OPTIONS)
    if isinstance(options, dict):
        for k, v in options.items():
            if k in DEFAULT_OPTIONS:
                opts[k] = bool(v)

    # 1) 归一化: 换行符 + 行尾空白
    if opts["normalize"]:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"[ \t]+$", "", text, flags=re.M)

    # 2) LaTeX 公式 (需在去空白等之前, 且跳过代码块/行内代码)
    if opts["latex_math"]:
        text = _convert_latex_math(text, inline_all=False)

    # 3) 富文本项目符号 -> Markdown 列表
    if opts["bullet_to_list"]:
        text = _bullet_to_list(text)

    # 4) 折叠多余空行
    if opts["collapse_blank"]:
        text = re.sub(r"\n{3,}", "\n\n", text)

    # 5) 去除换行 (破坏性, 默认关)
    if opts["remove_newlines"]:
        text = re.sub(r"\n(?=[A-Za-z])", " ", text).replace("\n", "")

    # 6) 去除空白 (保留换行, 默认关)
    if opts["remove_spaces"]:
        text = re.sub(r"[^\S\n]", "", text)

    # 7) 段间补空行 (默认关)
    if opts["add_paragraph_blank"]:
        text = re.sub(r"([^\n])\n([^\n])", r"\1\n\n\2", text)

    # 8) 全角转半角 (默认关)
    if opts["fullwidth_to_halfwidth"]:
        text = _fullwidth_to_halfwidth(text)

    return text
