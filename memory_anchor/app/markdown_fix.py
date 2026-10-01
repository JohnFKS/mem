"""Markdown 粘贴格式修正

借鉴 siyuan-plugin-text-process 的粘贴处理逻辑 (https://github.com/Achuan-2/
siyuan-plugin-text-process), 把"从外部复制进来的脏 Markdown"规整为干净的
Markdown。所有转换都是可选开关, 默认仅启用安全的子集:

- normalize          : 统一换行符 (CRLF/CR -> LF), 去除行尾空白
- latex_math        : 把 LaTeX 公式 \\[...\\] -> $$...$$ , \\(...\\) -> $...$ (跳过代码块/行内代码)
- bullet_to_list    : 把富文本项目符号 •○▪▫◆◇… 转成 Markdown 的 "- "
- collapse_blank    : 折叠 3 个及以上连续换行为一个空行

以下为可选 (默认关) 的进阶修正, 借鉴 siyuan 同名能力:

- strip_links             : 去除链接, 保留可见文字 ([label](url) -> label, <a>..</a> -> 文字)
- strip_superscript       : 去除上标/角标 (<sup>, ^x^, 独立 [n] 角标, Unicode 上标)
- headings_to_bold        : 标题转加粗 (**标题**), 导入时不再被 # 切分成多卡
- normalize_heading_levels: 标题层级归一 (最深的 # 对齐到 #, 即整体抬升到从 1 级开始)
- en_punct_to_cn          : 英文标点 -> 中文标点 (含成对引号翻转, 小数点 . 保留)
- cn_punct_to_en          : 中文标点 -> 英文标点
- remove_newlines         : 去换行 (按段落合并, 破坏性较强)
- remove_spaces           : 智能去空格 (仅删"中文与中文之间"的空格, 保留英文词间空格)
- add_paragraph_blank     : 段间补空行
- fullwidth_to_halfwidth  : 全角转半角 (并清除零宽字符)

所有"逐字符/逐行"的修正都会**跳过代码块 (```/~~~) 与行内代码 (`...`)**,
避免破坏代码内容 (这是 siyuan 与 mem 渲染层共同采用的"代码区外才替换"策略)。

用法:
    from app.markdown_fix import fix_markdown
    fixed = fix_markdown(text)                       # 使用默认安全子集
    fixed = fix_markdown(text, {"strip_links": True, "en_punct_to_cn": True})
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

# 空白字符 (含不间断空格 / 零宽 / 窄空格 / 全角空格)
_WS = re.compile(r"[ \t\u00a0\u200b\u202f\u3000]+")


DEFAULT_OPTIONS = {
    "normalize": True,
    "latex_math": True,
    "bullet_to_list": True,
    "collapse_blank": True,
    "strip_links": False,
    "strip_superscript": False,
    "headings_to_bold": False,
    "normalize_heading_levels": False,
    "en_punct_to_cn": False,
    "cn_punct_to_en": False,
    "remove_newlines": False,
    "remove_spaces": False,
    "add_paragraph_blank": False,
    "fullwidth_to_halfwidth": False,
}


# --------------------------------------------------------------------------- #
# 代码区保护: 把文本切成"代码段"与"普通段", 仅对普通段施加转换
# --------------------------------------------------------------------------- #
def _protect_inline_code(line: str, func) -> str:
    """对一行内行内代码 (`` `...` ``) 之外的部分施加 func, 代码原样保留。"""
    parts = []
    last = 0
    for m in _INLINE_CODE.finditer(line):
        parts.append(func(line[last : m.start()]))
        parts.append(m.group(0))
        last = m.end()
    parts.append(func(line[last:]))
    return "".join(parts)


def _protect_code(text: str, func, line_level: bool = False) -> str:
    """在围栏代码块 (```/~~~) 之外施加 func。

    line_level=True 时 func 逐行处理 (用于标题这类整行匹配的转换);
    line_level=False 时 func 处理"去掉行内代码后的每一行" (用于逐字符类转换)。
    """
    lines = text.split("\n")
    out = []
    fence = ""       # 当前围栏字符
    fence_len = 0
    for line in lines:
        fm = _FENCED_CODE_LINE.match(line)
        if not fence:
            if fm:
                fence = fm.group(1)[0]
                fence_len = len(fm.group(1))
                out.append(line)        # 围栏起始行原样保留
                continue
            if line_level:
                out.append(func(line))
            else:
                out.append(_protect_inline_code(line, func))
            continue
        # 处于围栏代码块内: 原样保留
        out.append(line)
        if fm and fm.group(1)[0] == fence and len(fm.group(1)) >= fence_len:
            fence, fence_len = "", 0
        continue
    return "\n".join(out)


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
# 项目符号 / 全半角
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


def _fullwidth_to_halfwidth_char(ch: str) -> str:
    code = ord(ch)
    # 零宽 / 窄空格 / 全角空格 -> 半角空格
    if (0x2000 <= code <= 0x200B) or code in (0x202F, 0x205F, 0x3000, 0x00A0):
        return " "
    # 全角 ASCII 可见字符与全角数字
    if 0xFF01 <= code <= 0xFF5E or 0xFF10 <= code <= 0xFF19:
        return chr(code - 0xFEE0)
    return ch


def _fullwidth_to_halfwidth(text: str) -> str:
    return "".join(_fullwidth_to_halfwidth_char(ch) for ch in text)


# --------------------------------------------------------------------------- #
# 新增: 借鉴 siyuan 的进阶修正
# --------------------------------------------------------------------------- #
def _strip_links(text: str) -> str:
    """去除链接保留文字: [label](url) -> label; ![alt](url) -> alt; <a>..</a> -> 文字。"""
    # 图片链接: 保留 alt 文字
    text = re.sub(r"!\[([^\]]*)\]\(([^)]*)\)", r"\1", text)
    # 普通链接: 保留 label
    text = re.sub(r"\[([^\]]*)\]\(([^)]*)\)", r"\1", text)
    # HTML 锚点: <a href="...">文字</a> -> 文字
    text = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", text, flags=re.I | re.S)
    # 裸自动链接 <https://...> -> 删除
    text = re.sub(r"<https?://[^>\s]+>", "", text)
    return text


# Unicode 上标字符 (⁰¹²³⁴⁵⁶⁷⁸⁹ ⁺⁻⁼⁽⁾)
_SUPER_RE = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾]")


def _strip_superscript(text: str) -> str:
    """去除上标/角标: <sup>..</sup>, Markdown ^x^, 独立 [n] 角标, Unicode 上标。"""
    # <sup> 标签 (连同内容)
    text = re.sub(r"</?sup\b[^>]*>", "", text, flags=re.I)
    # Markdown 上标 ^...^ (整段移除)
    text = re.sub(r"\^[^\^\n]+\^", "", text)
    # 独立数字角标 [n] (非链接的一部分, 链接已在前面剥离)
    text = re.sub(r"(?<!\])\[\d{1,3}\]", "", text)
    # Unicode 上标字符
    text = _SUPER_RE.sub("", text)
    return text


def _heading_line_to_bold(line: str) -> str:
    """把一行 ATX 标题转成加粗文字 (去掉 #)。"""
    m = re.match(r"^#{1,6}[\t ]+(.+)$", line)
    if not m:
        return line
    heading = m.group(1)
    # 去掉闭合式标题末尾的 #
    heading = re.sub(r"[\t ]+#+[\t ]*$", "", heading).strip()
    # 已经是 **x** / __x__ 的不重复加粗
    if re.match(r"^\*\*[^\n]+\*\*$", heading) or re.match(r"^__[^\n]+__$", heading):
        return heading
    return f"**{heading}**"


def _headings_to_bold(text: str) -> str:
    return _protect_code(text, _heading_line_to_bold, line_level=True)


def _normalize_heading_levels(text: str) -> str:
    """标题层级归一: 找出文档里最浅的 # 层级, 整体抬升到从 1 级开始。

    例: 若文档以 ## 作为一级分节, 则 ##/### 会被抬升为 #/##, 从而与 mem
    的"# 切分卡片"导入规则对齐。已是最浅 1 级或无标题则原样返回。
    代码块内的 # 不参与计算也不被修改。
    """
    lines = text.split("\n")
    min_level = None
    fence = ""; fence_len = 0

    def handle(line, collecting):
        nonlocal min_level, fence, fence_len
        fm = _FENCED_CODE_LINE.match(line)
        if not fence and fm:
            fence = fm.group(1)[0]; fence_len = len(fm.group(1)); return
        if fence:
            if fm and fm.group(1)[0] == fence and len(fm.group(1)) >= fence_len:
                fence = ""
            return
        m = re.match(r"^(#{1,6})[\t ]", line)
        if m:
            lv = len(m.group(1))
            if min_level is None or lv < min_level:
                min_level = lv

    for line in lines:
        handle(line, True)
    if min_level is None or min_level == 1:
        return text

    shift = min_level - 1
    out = []
    fence = ""; fence_len = 0
    for line in lines:
        fm = _FENCED_CODE_LINE.match(line)
        if not fence and fm:
            fence = fm.group(1)[0]; fence_len = len(fm.group(1))
            out.append(line); continue
        if fence:
            out.append(line)
            if fm and fm.group(1)[0] == fence and len(fm.group(1)) >= fence_len:
                fence = ""
            continue
        m = re.match(r"^(#{1,6})([\t ]+.*)$", line)
        if m:
            new_lv = max(1, len(m.group(1)) - shift)
            out.append("#" * new_lv + m.group(2))
        else:
            out.append(line)
    return "\n".join(out)


_EN_PUNCT_MAP = {
    ",": "，", ":": "：", ";": "；", "!": "！", "?": "？",
    "(": "（", ")": "）",
}
_CN_PUNCT_MAP = {
    "。": ".", "，": ",", "；": ";", "！": "!", "？": "?",
    "（": "(", "）": ")", "：": ":", "‘": "'", "’": "'",
    "“": '"', "”": '"', "【": "[", "】": "]", "｛": "{", "｝": "}",
}


def _en_punct_to_cn(text: str) -> str:
    """英文标点 -> 中文标点, 成对引号翻转, 小数点 . 不转换。"""
    sb = []
    single_open = False
    double_open = False
    for ch in text:
        if ch == "'":
            single_open = not single_open
            sb.append("‘" if single_open else "’")
        elif ch == '"':
            double_open = not double_open
            sb.append("“" if double_open else "”")
        else:
            sb.append(ch)
    s = "".join(sb)
    for k, v in _EN_PUNCT_MAP.items():
        s = s.replace(k, v)
    # 非小数点的 . 转中文句号 (7.28 之类的小数点保留)
    s = re.sub(r"(?<!\d)\.(?!\d)", "。", s)
    return s


def _cn_punct_to_en(text: str) -> str:
    """中文标点 -> 英文标点。"""
    return "".join(_CN_PUNCT_MAP.get(ch, ch) for ch in text)


def _smart_remove_spaces(text: str) -> str:
    """智能去空格 (借鉴 siyuan): 仅删"中文与中文之间"的空格, 保留英文词间空格。

    规则: 一段空白的两侧若都是中文 (非 ASCII) 则整段删除; 否则保留一个空格。
    空白两侧任一端缺失 (行/文本边界) 也删除。
    """
    def repl(m: re.Match) -> str:
        s, e = m.start(), m.end()
        prev = ""
        for c in reversed(text[:s]):
            if not _WS.match(c):
                prev = c; break
        nxt = ""
        for c in text[e:]:
            if not _WS.match(c):
                nxt = c; break
        if not prev or not nxt:
            return ""
        is_prev_cn = ord(prev) > 0xFF
        is_nxt_cn = ord(nxt) > 0xFF
        return "" if (is_prev_cn and is_nxt_cn) else " "
    return _WS.sub(repl, text)


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

    # 4) 去除链接, 保留文字 (跳过代码)
    if opts["strip_links"]:
        text = _protect_code(text, _strip_links, line_level=False)

    # 5) 去除上标/角标 (跳过代码)
    if opts["strip_superscript"]:
        text = _protect_code(text, _strip_superscript, line_level=False)

    # 6) 标题转加粗 (跳过代码块)
    if opts["headings_to_bold"]:
        text = _headings_to_bold(text)

    # 7) 标题层级归一 (跳过代码块)
    if opts["normalize_heading_levels"]:
        text = _normalize_heading_levels(text)

    # 8) 折叠多余空行
    if opts["collapse_blank"]:
        text = re.sub(r"\n{3,}", "\n\n", text)

    # 9) 英文标点 -> 中文 (跳过代码)
    if opts["en_punct_to_cn"]:
        text = _protect_code(text, _en_punct_to_cn, line_level=False)

    # 10) 中文标点 -> 英文 (跳过代码)
    if opts["cn_punct_to_en"]:
        text = _protect_code(text, _cn_punct_to_en, line_level=False)

    # 11) 去除换行 (破坏性, 默认关)
    if opts["remove_newlines"]:
        text = re.sub(r"\n(?=[A-Za-z])", " ", text).replace("\n", "")

    # 12) 智能去空格 (跳过代码)
    if opts["remove_spaces"]:
        text = _protect_code(text, _smart_remove_spaces, line_level=False)

    # 13) 段间补空行 (默认关)
    if opts["add_paragraph_blank"]:
        text = re.sub(r"([^\n])\n([^\n])", r"\1\n\n\2", text)

    # 14) 全角转半角 + 清零宽 (跳过代码)
    if opts["fullwidth_to_halfwidth"]:
        text = _protect_code(text, _fullwidth_to_halfwidth, line_level=False)

    return text


# --------------------------------------------------------------------------- #
# 思源笔记 kramdown 方言清洗 (事项5: 快速捕捉)
# --------------------------------------------------------------------------- #
# 块引/双链: ((20240301120000-abcdefg "显示文本"))
_SIYUAN_REF = re.compile(r"\(\((\d{14}-[0-9a-z]{7})\s+[\"“”]([^\"”]*)[\"“”]\)\)")
_SIYUAN_REF_NO_TEXT = re.compile(r"\(\((\d{14}-[0-9a-z]{7})\)\)")
# 思源内链: [文本](siyuan://blocks/xxx)
_SIYUAN_LINK = re.compile(r"\[([^\]]*)\]\(siyuan://[^)]*\)")
# 思源标签: #标签# -> #标签
_SIYUAN_TAG = re.compile(r"#([^#\s]+)#")
# IAL 属性: {: id="..." updated="..." }
_SIYUAN_IAL_TAIL = re.compile(r"\s*\{:.*?\}\s*$")
_SIYUAN_IAL_ANY = re.compile(r"\{:.*?\}")
# 嵌入块: {{select * from blocks}}
_SIYUAN_EMBED = re.compile(r"^\s*\{\{.*\}\}\s*$")


def clean_siyuan_dialect(text: str) -> str:
    """清洗思源笔记复制出来的 kramdown 方言, 只作用于非代码块区间。

    按序处理: 嵌入块(整行删) -> IAL 属性 -> 块引/双链 -> 思源标签。
    任何来源粘贴的内容都能享受这套清洗, 不只在思源插件里生效。
    """
    if not text:
        return text or ""

    def _clean_line(line: str) -> str:
        # 4) 嵌入块: 整行删除
        if _SIYUAN_EMBED.match(line):
            return ""
        s = line
        # 1) IAL 属性: 优先去行尾, 再兜底去掉残留
        s = _SIYUAN_IAL_TAIL.sub("", s)
        s = _SIYUAN_IAL_ANY.sub("", s)
        # 2) 块引 / 双链 -> 只保留显示文本
        s = _SIYUAN_REF.sub(lambda m: m.group(2), s)
        s = _SIYUAN_REF_NO_TEXT.sub("", s)
        s = _SIYUAN_LINK.sub(lambda m: m.group(1), s)
        # 3) 思源标签 #标签# -> #标签
        s = _SIYUAN_TAG.sub(lambda m: "#" + m.group(1), s)
        return s

    out = _protect_code(text, _clean_line, line_level=True)
    # 删除嵌入块后可能留下连续空行, 最多压成 1 个
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()
