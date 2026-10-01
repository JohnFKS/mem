"""AI 可选增强: OpenAI 兼容 /chat/completions 调用封装

设计原则 (见 TODO.md「AI 三态开关与自动回退」):
- AI 是**可选**的: 未配置 -> is_configured() 为假, 各端点快速失败 503 ai_not_configured。
- 调用失败 -> 抛 AIError, 由路由层转成 502, 前端走熔断回退到零 AI 路径。
- 不引 SDK, 用 requests; **所有调用必须带 timeout**（默认 25s，可用设置项 ai_timeout 调，夹在 5~120）。
"""
import json
import logging
import re
import time

import requests

from app.db import get_setting

TIMEOUT_API = 25      # 正常调用 (实测部分中转单次 8~12s, 10s 太紧)
TIMEOUT_PING = 25     # 连通测试 (同上; 可用设置项 ai_timeout 覆盖)
MAX_TITLE_LEN = 60
MAX_MNEMONIC_LEN = 800

logger = logging.getLogger(__name__)


class AIError(Exception):
    """AI 调用失败。

    detail 里带可直接排查的字段 (url/status/elapsed_ms/服务端原文/建议),
    会一路透传到前端诊断面板; **绝不包含 api_key**。
    """

    def __init__(self, message: str, detail: dict = None):
        super().__init__(message)
        self.detail = detail or {}


# ---- base_url 规范化 ----
# 最常见的配置错误就是把整条 chat 接口地址贴进来, 或漏写协议头。
# 这里只做"去掉多余尾巴"的安全改写, 不改语义。
_BAD_SUFFIXES = ("/chat/completions", "/completions", "/v1/chat/completions")


_LOCAL_HOST = re.compile(
    r"^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}|192\.168\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3})(:|/|$)", re.I)


def _guess_scheme(host_part: str) -> str:
    """本机/内网默认 http, 公网才默认 https (免得给 localhost 套 TLS 直接失败)。"""
    return "http" if _LOCAL_HOST.match(host_part or "") else "https"


def normalize_base_url(raw: str) -> tuple:
    """返回 (规范化后的 base_url, 提示列表)。"""
    u = (raw or "").strip()
    if not u:
        return "", []
    notes = []
    if not re.match(r"^https?://", u, re.I):
        scheme = _guess_scheme(u)
        u = f"{scheme}://{u}"
        notes.append(f"地址缺少 http(s):// 协议头，已按 {u} 尝试；"
                     f"如果实际是{'https' if scheme == 'http' else 'http'}，请把协议头写全")
    u = u.rstrip("/")
    for suf in _BAD_SUFFIXES:
        if u.endswith(suf):
            u = u[: -len(suf)].rstrip("/")
            notes.append(f"已自动去掉末尾的 {suf}：Base URL 只需填到 /v1 这一级，"
                         "程序会自己拼 /chat/completions")
            break
    return u, notes


def _cfg() -> dict:
    base, notes = normalize_base_url(get_setting("ai_base_url"))
    return {
        "base_url": base,
        "api_key": str(get_setting("ai_api_key") or "").strip(),
        "model": str(get_setting("ai_model") or "").strip(),
        "base_notes": notes,
    }


def _cfg_from(base_url=None, api_key=None, model=None) -> dict:
    """用覆盖值构建配置: 测试连接时允许"还没保存就先试"。"""
    c = _cfg()
    if base_url is not None:
        c["base_url"], c["base_notes"] = normalize_base_url(base_url)
    if api_key is not None:
        c["api_key"] = str(api_key or "").strip()
    if model is not None:
        c["model"] = str(model or "").strip()
    return c


def is_configured() -> bool:
    """三个配置键均非空才算已配置。"""
    c = _cfg()
    return bool(c["base_url"] and c["api_key"] and c["model"])


def _mask_key(key: str) -> str:
    """只留首尾各 3 位, 用于日志/回显确认"填的是哪把钥匙"。"""
    k = (key or "").strip()
    if len(k) <= 8:
        return "*" * len(k)
    return f"{k[:3]}…{k[-3:]}({len(k)}位)"


def _short_exc(e) -> str:
    """把 requests 的超长异常压成一行可诊断的摘要。"""
    s = str(e) or type(e).__name__
    s = re.sub(r"\s+", " ", s).strip()
    # 去掉 urlib3 那串重复的连接池描述, 只留根因
    m = re.search(r"Caused by ([^)]+\))", s)
    if m:
        s = m.group(1)
    return s[:300]


def _classify_exception(e) -> tuple:
    """把网络层异常翻译成 (kind, 人话原因, 怎么办)。"""
    names = set()
    cur = e
    for _ in range(6):
        if cur is None:
            break
        names.add(type(cur).__name__)
        cur = cur.__cause__ or cur.__context__
    raw = _short_exc(e)

    if "NameResolutionError" in names or "gaierror" in names:
        return ("dns", f"域名解析失败：{raw}",
                "域名拼错了，或这台机器解析不了该域名。"
                "本机/内网请直接用 IP；外网域名先确认 DNS 与代理是否可用。")
    if "ProxyError" in names:
        return ("proxy", f"代理连接失败：{raw}",
                "检查 HTTP_PROXY / HTTPS_PROXY 环境变量指向的代理是否活着；"
                "不需要代理时把它们清掉。")
    if "ConnectionRefusedError" in names or "NewConnectionError" in names and "refused" in raw.lower():
        return ("refused", f"连接被拒绝：{raw}",
                "目标端口上没有服务在监听。检查端口写错没、记忆锚之外的那个 AI 服务是否启动。")
    if "SSLError" in names or "CertificateError" in names or "ssl" in raw.lower():
        return ("tls", f"TLS/证书校验失败：{raw}",
                "域名与证书不匹配、系统根证书过期，或链路被中间设备/代理掐断"
                "（握手阶段直接断开通常是后者）。若是本机自签服务，把 https 换成 http。")
    if any("Timeout" in n for n in names) or isinstance(e, requests.Timeout):
        return ("timeout", f"连接超时：{raw}",
                "到该地址的网络不通或太慢（常见于直连境外接口），或这次生成本身就慢。"
                "先把设置页的「超时(秒)」调大（默认 25，最大 120）再试；"
                "仍然超时就换可直连的中转地址。")
    return ("network", f"网络请求失败：{raw}",
            "网络层异常，不是鉴权问题。按上面的原始报错核对地址与网络环境。")


# HTTP 状态码 -> (人话原因, 怎么办)
_HTTP_HINTS = {
    400: ("请求被拒绝（400）", "多数是模型名不被支持，或该服务不接受某个参数。到服务商控制台核对模型名。"),
    401: ("鉴权失败（401）", "API Key 填错、过期，或被服务商吊销。重新生成一把 Key 再试。"),
    403: ("无访问权限（403）", "这把 Key 没开通该模型，或受地区/额度限制。换模型或换 Key。"),
    404: ("接口不存在（404）", "Base URL 只填到 /v1，末尾不要带 /chat/completions；"
                              "也可能该服务根本不提供 OpenAI 兼容接口。"),
    408: ("请求超时（408）", "服务端处理太久。换个更快的模型再试。"),
    422: ("参数不合法（422）", "请求体被拒，通常是模型名不支持或 max_tokens 超限。"),
    429: ("限流或余额不足（429）", "触发速率限制，或账户额度用完了。稍后再试/充值。"),
}


def _resp_text(resp) -> str:
    """按 UTF-8 取响应体。

    requests 对 text/* 且未声明 charset 的响应会退回 ISO-8859-1,
    中文报错会变成乱码——诊断信息里必须看得懂, 所以强制按 UTF-8 解。
    """
    enc = (resp.encoding or "").lower()
    if enc and enc not in ("iso-8859-1", "latin-1", "ascii"):
        return resp.text
    try:
        return resp.content.decode("utf-8", errors="replace")
    except (AttributeError, UnicodeError):
        return resp.text or ""


def _safe_body(text: str, limit: int = 400) -> str:
    """服务端响应片段: 截断 + 抹掉任何看起来像 key 的串。"""
    s = (text or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(sk-[A-Za-z0-9_\-]{6,})", "sk-***", s)
    s = re.sub(r"(Bearer\s+)[A-Za-z0-9_\-\.]{6,}", r"\1***", s)
    return s[:limit]


def _server_error_message(text: str) -> str:
    """从 OpenAI 风格错误体里抽人类可读的 message。"""
    try:
        data = json.loads(text or "")
    except (ValueError, TypeError):
        return ""
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err.get("code") or "")
    if isinstance(err, str):
        return err
    if isinstance(data, dict):
        return str(data.get("message") or data.get("msg") or "")
    return ""


def _looks_like_sse(text: str) -> bool:
    """是否像 SSE 流式响应 (data: {...} 一行一个 chunk)。"""
    t = (text or "").lstrip()
    return t.startswith("data:") or "\ndata:" in t or "data: {" in t


def _parse_sse(text: str) -> tuple:
    """把 SSE 流式响应聚合成完整文本, 返回 (content, finish_reason)。

    有些 OpenAI 兼容网关/中转无视 stream=false, 一律按 SSE 返回; 这里兼容它,
    把所有 chunk 的 delta.content 拼起来, 并记住最后一个非空的 finish_reason
    (用它判断回答是不是被 max_tokens 掐断了)。
    """
    payloads = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith(":"):      # 注释 / 心跳
            continue
        if line.startswith("data:"):
            payloads.append(line[5:].strip())
    if not payloads:
        # 极端情况: 整段挤在一行里
        payloads = re.findall(r"data:\s*(\{.*?\})(?=\s*(?:data:|$))", text or "", re.S)

    out = []
    finish = None
    for p in payloads:
        if p in ("[DONE]", "DONE"):
            break
        try:
            obj = json.loads(p)
        except (ValueError, TypeError):
            continue
        for ch in (obj.get("choices") or []):
            if not isinstance(ch, dict):
                continue
            fr = ch.get("finish_reason")
            if isinstance(fr, str) and fr:
                finish = fr
            delta = ch.get("delta") or {}
            piece = delta.get("content") if isinstance(delta, dict) else None
            if not piece:
                piece = ch.get("text") or ch.get("content")
            if isinstance(piece, str) and piece:
                out.append(piece)
            elif isinstance(piece, list):        # 少数实现把 content 拆成片段数组
                for sub in piece:
                    if isinstance(sub, dict) and isinstance(sub.get("text"), str):
                        out.append(sub["text"])
    return "".join(out), finish


def _http_diagnose(status: int, text: str) -> tuple:
    reason, hint = _HTTP_HINTS.get(status, ("", ""))
    if not reason:
        if 500 <= status < 600:
            reason = f"服务端故障（{status}）"
            hint = "AI 服务商自己报错，与你的配置无关。稍后重试或换节点。"
        else:
            reason = f"返回 {status}"
            hint = "非 200 响应，看下面的服务端原文判断。"
    server_msg = _server_error_message(text)
    if server_msg:
        reason = f"{reason}：{server_msg[:120]}"
    return reason, hint


def _timeout(default: float = TIMEOUT_API) -> float:
    """超时秒数: 设置项 ai_timeout 优先 (默认 25s, 夹在 5~120)。

    实测有的中转/聚合网关单次响应就要 8~12s, 10s 会直接超时失败,
    所以把默认值放宽并允许用户自己调。
    """
    try:
        v = float(get_setting("ai_timeout") or 0)
    except (TypeError, ValueError):
        v = 0
    if v <= 0:
        return default
    return max(5.0, min(120.0, v))


def _merge_messages(messages: list) -> list:
    """把提示词(system)直接写进唯一的 user 消息里。

    **为什么默认这么做**: 实测不少中转/聚合网关(尤其 gradio 类)根本不区分 role,
    把整段输入都当成用户的聊天提问。提示词放 system 时它要么不生效、要么被模型
    "回复"一句(「请提供需要格式化的原始回复文本」)。把要求直接写进内容、
    且放在末尾(模型对最后几句注意力最高), 任何实现都能读到。
    """
    sys_parts, user_parts = [], []
    for m in messages or []:
        role = (m or {}).get("role")
        content = (m or {}).get("content") or ""
        if role == "system":
            sys_parts.append(content)
        else:
            user_parts.append(content)
    head = "\n\n".join(p for p in sys_parts if p.strip())
    tail = "\n\n".join(p for p in user_parts if p.strip())
    text = f"{head}\n\n---\n\n{tail}" if head else tail
    # 指令放末尾: 这类网关把整段都当用户提问, 模型更关注最后几句
    text += ("\n\n---\n请严格按上面的要求输出【结果正文】："
             "只给结果本身，不要复述要求、不要解释说明。")
    return [{"role": "user", "content": text}]


# 模型在"回复指令"而不是"完成任务"时的典型措辞
_META_REPLY = re.compile(
    r"(请提供|请给出|请发送|需要提供|原始回复|原始文本|格式化的原始"
    r"|请问你|请问您|您希望|你希望|我可以帮|我能帮|有什么可以帮"
    r"|作为.*?(助手|模型).{0,10}(我|无法)"
    r"|已生成完毕|请告诉我)", re.I)


# 模型把卡片当聊天问题回答时吐出来的代码/讲解
_CODE_REPLY = re.compile(
    r"```"
    r"|^\s*(def |class |import |from \w+ import |public |function |#include)"
    r"|\b(python|java|c\+\+|javascript)\b(?=[\s:：])",
    re.I | re.M)


def _looks_like_code(text: str) -> bool:
    """返回内容是一段代码/讲解, 而不是我们要的标题或速记。"""
    return bool((text or "").strip()) and bool(_CODE_REPLY.search(text or ""))


# 某些模型(尤其 agent 类)会把内部工具调用标记直接吐出来: <|DSML|tool_calls> <invoke ...>
_TOOLCALL_RE = re.compile(
    r"<\|[^|\s]{0,30}\|"                       # <|DSML|tool_calls> / </|DSML|>
    r"|<(?:tool_call|invoke|antml|function_call)[^>]*>"
    r"|<[｜\uFF5C]DSML[｜\uFF5C]", re.I)


def _looks_like_toolcall(text: str) -> bool:
    return bool((text or "").strip()) and bool(_TOOLCALL_RE.search(text or ""))


def _strip_tool_calls(text: str) -> str:
    """去掉模型吐出来的工具调用块, 只留下正文。"""
    t = text or ""
    t = re.sub(r"<\|[^|\s]{0,30}\|.*?(?:</\|[^|\s]{0,30}\|>|$)", "", t, flags=re.S)
    t = re.sub(r"<(?:tool_call|invoke|antml|function_call)[^>]*>.*?"
               r"(?:</(?:tool_call|invoke|antml|function_call)>|$)", "", t,
               flags=re.S | re.I)
    return t.strip()


def _looks_like_meta_reply(text: str) -> bool:
    """返回内容像是在回应我们的提示词, 而不是完成命名/分析任务。"""
    t = (text or "").strip()
    if not t:
        return False
    return bool(_META_REPLY.search(t[:200]))


def chat(messages: list, max_tokens: int = 200, json_mode: bool = False,
         timeout: float = None, cfg: dict = None, fallback: bool = True) -> str:
    """调用 /chat/completions, 返回 assistant 的文本内容。失败抛 AIError(带 detail)。

    **提示词一律写进 user 内容**(见 _merge_messages), 不再依赖 system 角色——
    这是为了兼容把整段输入都当聊天提问的网关。
    """
    timeout = timeout if timeout else _timeout()
    # 有 system 就先并进 user; 之后 messages 里只剩一条 user
    sent = _merge_messages(messages) if any(
        (m or {}).get("role") == "system" for m in messages or []) else list(messages or [])
    try:
        content, finish = _request_once(sent, max_tokens, json_mode, timeout, cfg)
    except AIError as e:
        # 网关不支持 response_format=json_object 时, 去掉它重试一次
        if json_mode and (e.detail or {}).get("status") == 400:
            body = (e.detail.get("body") or "") + (e.detail.get("reason") or "")
            if re.search(r"response_format|json_object|json_schema", body, re.I):
                logger.warning("response_format 不被支持, 去掉后重试")
                again, _ = _request_once(sent, max_tokens, False, timeout, cfg)
                return again
        raise
    if finish == "length":
        # 回答被 max_tokens 掐断了: 加码再要一次 (完整的那个更长就用完整的)
        bigger = max(int(max_tokens) * 4, 800)
        logger.warning("回答被 max_tokens 掐断(finish_reason=length), 用 %s 重试", bigger)
        try:
            full, _ = _request_once(sent, bigger, json_mode, timeout, cfg)
        except AIError:
            return content
        if full and len(full) > len(content):
            content = full
    if _looks_like_toolcall(content):
        # 模型把内部工具调用标记吐出来了: 剥掉; 剥完没内容就换说法再要一次
        content = _strip_tool_calls(content)
        if not content.strip() and fallback:
            logger.warning("返回内容疑似工具调用标记，换种说法再要一次")
            retry = [{"role": "user",
                      "content": sent[0]["content"] + "\n\n直接给出结果正文，不要输出任何标记或工具调用。"}]
            try:
                again, _ = _request_once(retry, max_tokens, json_mode, timeout, cfg)
            except AIError:
                return content
            if again and again.strip() and not _looks_like_toolcall(again):
                content = again
    if fallback and _looks_like_meta_reply(content):
        logger.warning("返回内容疑似在回复指令(%s)，换一种说法再要一次", content[:60])
        retry = [{"role": "user",
                  "content": sent[0]["content"] + "\n\n直接给出结果，不要提问、不要寒暄。"}]
        try:
            again, _ = _request_once(retry, max_tokens, json_mode, timeout, cfg)
        except AIError:
            return content          # 重试失败就用第一次的结果, 不把错误抛上去
        if again and again.strip():
            return again
    return content


def _request_once(messages: list, max_tokens: int, json_mode: bool,
                  timeout: float, cfg: dict = None) -> tuple:
    """单次 /chat/completions 请求 + 响应解析, 返回 (content, finish_reason)。

    chat 的编排会调用它一到两次 (response_format 不支持 / 回答被 max_tokens 掐断时重试)。
    """
    c = cfg or _cfg()
    if not (c["base_url"] and c["api_key"] and c["model"]):
        raise AIError("AI 未配置，功能已关闭",
                      {"kind": "not_configured", "hint": "在设置页填好 Base URL / API Key / 模型名"})
    url = f"{c['base_url']}/chat/completions"
    headers = {
        "Authorization": f"Bearer {c['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": c["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
        # 显式声明不要流式: 多数网关会尊重; 少数强制 SSE 的在下面按流式聚合兜底
        "stream": False,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    common = {"url": url, "model": c["model"],
              "key_masked": _mask_key(c["api_key"]),
              "notes": c.get("base_notes") or []}
    t0 = time.time()
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    except requests.RequestException as e:
        kind, reason, hint = _classify_exception(e)
        detail = dict(common, kind=kind, reason=reason, hint=hint,
                      elapsed_ms=int((time.time() - t0) * 1000),
                      raw=_short_exc(e))
        logger.warning("AI 调用失败 [%s] %s | %s", kind, reason, detail)
        raise AIError(f"AI 服务连接失败：{reason}", detail)
    elapsed = int((time.time() - t0) * 1000)

    if resp.status_code != 200:
        body = _resp_text(resp)
        reason, hint = _http_diagnose(resp.status_code, body)
        detail = dict(common, kind="http", reason=reason, hint=hint,
                      status=resp.status_code, elapsed_ms=elapsed,
                      body=_safe_body(body))
        logger.warning("AI 返回非 200 [status=%s] %s | body=%s",
                       resp.status_code, reason, detail["body"])
        raise AIError(f"AI 服务{reason}", detail)

    text = _resp_text(resp)
    ctype = (resp.headers.get("Content-Type") or "").lower()

    # 1) 流式: 部分网关无视 stream=false, 一律按 SSE 返回, 这里把 chunk 拼起来
    if "text/event-stream" in ctype or _looks_like_sse(text):
        content, finish = _parse_sse(text)
        if content.strip():
            return content, finish
        detail = dict(common, kind="parse", elapsed_ms=elapsed,
                      reason="服务端以 SSE 流式返回，但聚合后没有拿到任何文本内容",
                      hint="网关强制走了流式且没有回传内容（或只回了 role 没有 content）。"
                           "换一个支持非流式的接口地址，或换模型再试。",
                      body=_safe_body(text))
        logger.warning("SSE 聚合为空 | body=%s", detail["body"])
        raise AIError("AI 响应解析失败：流式响应里没有文本内容", detail)

    # 2) 常规 JSON
    try:
        data = json.loads(text)
        ch = (data.get("choices") or [{}])[0]
        return ch["message"]["content"], (ch.get("finish_reason") or "")
    except (ValueError, KeyError, IndexError, TypeError) as e:
        # 有些实现把单个 chunk 当 JSON 直接回 (object=chat.completion.chunk)
        chunk_txt = ""
        try:
            chunk_txt, _ = _parse_sse("data: " + text)
        except Exception:
            chunk_txt = ""
        if chunk_txt.strip():
            return chunk_txt, ""
        reason = f"响应不是预期的 OpenAI 结构（{type(e).__name__}）"
        hint = "接口返回的不是 OpenAI 兼容格式。确认 Base URL 指向的是 /v1，" \
               "且没有被网关/登录页拦截（响应是不是一段 HTML？）。"
        if "<html" in text.lower()[:200] or "<!doctype" in text.lower()[:200]:
            reason = "响应是一段 HTML（多半被网关或登录页拦截了）"
            hint = "Base URL 是否填错、是否要走代理、该地址是否需要登录才能访问。"
        detail = dict(common, kind="parse", elapsed_ms=elapsed, reason=reason,
                      hint=hint, body=_safe_body(text))
        logger.warning("AI 响应解析失败: %s | body=%s", e, detail["body"])
        raise AIError("AI 响应解析失败：响应不是 OpenAI 兼容格式", detail)


TITLE_SYSTEM = (
    "你是学习卡片的命名助手。根据卡片正文拟一个中文标题：\n"
    "- 10~20 个字，概括核心知识点，不加句号\n"
    '- 不要"关于""浅谈"等废话前缀\n'
    "- 只输出标题本身，不要任何解释或引号"
)


# 模型/网关偶尔直接回这些字面量, 不能当成标题或速记写进卡片
_JUNK_LITERALS = {
    "undefined", "null", "none", "nan", "n/a", "na", "-", "--", "无", "无标题",
    "undefinedundefined", "error", "错误",
}


def _clip(text: str, limit: int, ellipsis: bool = True) -> str:
    """超长时在最后一个句读处收尾, 而不是硬截在半句话中间。

    保留至少 60% 的内容; 实在找不到断点才硬截。
    """
    t = (text or "").strip()
    if len(t) <= limit:
        return t
    head = t[:limit]
    cut = 0
    for m in re.finditer(r"[。！？!?；;\n]|，|、| ", head):
        if m.end() >= limit * 0.6:
            cut = m.end()
    out = head[:cut].rstrip(" ，,、；;：:") if cut else head.rstrip()
    return (out + "…") if ellipsis else out


def _tidy_title(raw: str) -> str:
    """把模型的回答收拾成一个像样的短标题。

    中转网关常把 `system` 当提问，模型于是无视"10~20 个字"的要求回一整段说明
    （如"拉格朗日中值定理是微积分中的基本定理之一，它建立了……"）。
    这里按"谓语/句读"断在完整短语上，而不是硬截在半句话中间。
    """
    t = _strip_tool_calls(raw)                      # 模型吐的工具调用标记一律剥掉
    if "```" in t:                                  # 代码块: 只保留前面的话
        t = t.split("```")[0]
    t = re.sub(r"\s+", " ", t.strip())
    t = t.strip('"\'`* ').strip()
    t = t.replace("**", "").replace("`", "")       # 去掉模型爱加的加粗/代码标记
    t = re.sub(r"^(标题|主题)\s*[:：]\s*", "", t)
    t = re.sub(r"^#+\s*", "", t)                    # 模型偶尔加 markdown 标题标记
    # 模型把 undefined/null 当前缀吐出来: "undefined：单调有界准则" -> "单调有界准则"
    t = re.sub(r"^(?:undefined|null|none|nan)\s*[:：\-—]?\s*", "", t, flags=re.I)
    t = t.split("\n")[0].strip()
    t = re.split(r"#{2,}", t)[0].strip()            # 模型回长文时切掉 markdown 小标题
    if not t or t.lower() in _JUNK_LITERALS:        # 模型偶尔就回一个 "undefined"
        return ""
    if len(t) > MAX_TITLE_LEN:
        t = _clip(t, MAX_TITLE_LEN, ellipsis=False)
    if len(t) > 24:
        # 括号/冒号前通常是正题: "X（Lagrange …）是……" -> "X"
        m = re.match(r"^(.{3,20}?)[（(【:：]", t)
        if m and len(m.group(1)) >= 3:
            t = m.group(1)
    if len(t) > 24:
        # 断在第一个谓语前: "X是微积分中的基本定理之一，……" -> "X"
        m = re.match(r"^(.{4,20}?)(是|指的是|描述了|说明了|揭示了|表明|用于|用来|把|将|即)", t)
        # "这/那/它" 开头的残句不是标题, 不切
        if m and len(m.group(1)) >= 4 and m.group(1)[0] not in "这那它其该此":
            t = m.group(1)
    if len(t) > 24:
        # "…的递归实现 python class TreeNode…" -> 断在代码关键字前
        m = re.match(r"^(.{4,24}?)\s+(python|def|class|import|public|function|java"
                     r"|代码如下|code)\b", t, re.I)
        if m and len(m.group(1)) >= 4:
            t = m.group(1)
    if len(t) > 24:
        # 再断在第一个句读处, 至少留 6 个字
        m = re.match(r"^(.{6,24}?)[。！？!?；;，,]", t)
        if m:
            t = m.group(1)
    t = t.strip(" ，,、；;：:。.")
    return "" if t.lower() in _JUNK_LITERALS else t


def generate_title(content_md: str) -> str:
    """根据正文生成标题。正文过长先截断到 2000 字符。"""
    text = (content_md or "").strip()
    if not text:
        raise AIError("正文为空")
    text = text[:2000]
    messages = [
        {"role": "system", "content": TITLE_SYSTEM},
        {"role": "user", "content": text},
    ]
    raw = chat(messages, max_tokens=80, timeout=_timeout())
    if _looks_like_code(raw) or not _tidy_title(raw):
        # 网关把卡片当聊天问题回答了(吐了一堆代码), 换个说法再要一次
        logger.warning("标题返回疑似代码，换个说法再要一次")
        again = chat(
            [{"role": "user",
              "content": f"给下面这张学习卡片起一个 10~20 字的中文标题，"
                         f"只输出标题本身，不要代码、不要讲解、不要举例：\n\n{text}"}],
            max_tokens=80, timeout=_timeout(), fallback=False)
        if again and not _looks_like_code(again):
            raw = again
    title = _tidy_title(raw)
    if not title:
        raise AIError("AI 返回空标题")
    return title


GAP_SYSTEM = (
    "你是费曼学习法的检查员。对比【标准内容】与【学生复述】，输出严格 JSON（不要多余文字）：\n"
    '{"coverage": 0-100整数,            // 复述覆盖标准内容要点的百分比\n'
    ' "missed": ["被遗漏的要点", ...],   // 最多5条\n'
    ' "wrong": [{"claim":"复述中错误的原句片段","correction":"正确说法"}, ...],  // 最多3条\n'
    ' "advice_rating": "again"|"hard"|"easy",   // 按覆盖度与错误数: <40或错误≥2→again; 40~75→hard; >75且无错误→easy\n'
    ' "comment": "一句话总评"}\n'
    "标准内容与复述都可能含公式，注意 $...$ 保持原样比较。"
)


def _parse_gap(raw: str) -> dict:
    """解析 gap 分析 JSON: 先直接解析, 失败则去代码围栏, 再用正则提取首个 JSON 块。"""
    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    data = None
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                data = json.loads(m.group(0))
            except (ValueError, TypeError):
                data = None
    if not isinstance(data, dict):
        raise AIError("AI 返回内容无法解析为 JSON")

    def _int(v, default=0):
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    rating = data.get("advice_rating")
    if rating not in ("again", "hard", "easy"):
        rating = "hard"
    return {
        "coverage": max(0, min(100, _int(data.get("coverage"), 0))),
        "missed": [str(x) for x in (data.get("missed") or [])][:5],
        "wrong": [
            {"claim": str(w.get("claim", "")),
             "correction": str(w.get("correction", ""))}
            for w in (data.get("wrong") or []) if isinstance(w, dict)
        ][:3],
        "advice_rating": rating,
        "comment": str(data.get("comment", "")),
    }


def gap_analysis(standard_md: str, user_summary: str) -> dict:
    """费曼复述对比分析: 标准内容 vs 学生复述, 返回结构化 gap。"""
    std = (standard_md or "").strip()
    summ = (user_summary or "").strip()
    if not std:
        raise AIError("标准内容为空")
    if not summ:
        raise AIError("复述为空")
    std, summ = std[:3000], summ[:1000]
    raw = chat(
        [
            {"role": "system", "content": GAP_SYSTEM},
            {"role": "user",
             "content": f"【标准内容】\n{std}\n\n【学生复述】\n{summ}"},
        ],
        max_tokens=900, json_mode=True, timeout=_timeout(),
    )
    return _parse_gap(raw)


# ---- 速记 (mnemonic): 生成"方便记忆的小技巧" ----
# 提示词的编写要点:
#   1) 明确任务边界——只做"记忆钩子", 不做讲解/不复述原文/不补充新知识(类比需标注);
#      否则模型会输出一篇知识点总结, 与卡片正文重复, 反而没人看。
#   2) 给出可选手法清单(口诀/谐音/类比/图像化/对比反例), 约束输出风格一致;
#   3) 强约束公式原样保留: 学习卡片大量含 LaTeX, 一旦被模型"改写"就是错的;
#   4) 规定输出格式与字数上限, 保证直接能塞进卡片里当速记用。
MNEMONIC_SYSTEM = (
    "你是记忆技巧设计师，为一张学习卡片设计“记得住”的辅助线索。\n"
    "【做什么】\n"
    "1. 只挑卡片里真正难记、易混、易忘的点：术语、公式、符号、顺序、前提条件、例外。\n"
    "2. 给每个点配一个能立刻复用的记忆钩子，手法优先从下面选：\n"
    "   · 口诀 / 谐音 / 首字母：把要点压成一句顺口的话\n"
    "   · 类比：用生活经验或已知概念打比方（必须以“类比：”开头，明示它不是事实）\n"
    "   · 图像化：描述一帧能想象出来的画面\n"
    "   · 对比 / 反例：与易混淆概念对照，指出差别或给一个反例\n"
    "3. 公式、符号、变量名必须与原文完全一致，用 $...$ 原样保留"
    "（例如 $x_{n+1}=\\frac12(x_n+\\arctan x_n)$）。\n"
    "\n"
    "【禁止】\n"
    "· 不要复述、翻译或概括卡片原文（原文用户自己有）\n"
    "· 不要补充原文没有的新知识（类比除外，且必须标明是类比）\n"
    "· 不要开场白、总结语、客套话，不要用代码块\n"
    "\n"
    "【输出】严格输出 Markdown，2~3 条，每条一行，形如：\n"
    "- **口诀**：要记的点 → 顺口的一句话\n"
    "每条不超过 40 字，全文不超过 200 字。"
)


def generate_mnemonic(title: str, content_md: str) -> str:
    """根据卡片正文生成速记（助记技巧）。返回 Markdown 文本。"""
    std = (content_md or "").strip()
    if not std:
        raise AIError("卡片正文为空，无法生成速记")
    std = std[:3000]
    head = (title or "").strip()[:200]
    raw = chat(
        [
            {"role": "system", "content": MNEMONIC_SYSTEM},
            {"role": "user",
             "content": f"【卡片标题】\n{head}\n\n【卡片正文】\n{std}"},
        ],
        max_tokens=1200,
        timeout=_timeout(),
    )
    text = _strip_tool_calls(raw)
    # 兜底清理: 去掉模型偶尔裹上的代码围栏
    text = re.sub(r"^```(?:markdown|md)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    if not text or text.lower() in _JUNK_LITERALS:
        raise AIError("AI 返回空速记")
    return _clip(text, MAX_MNEMONIC_LEN)


def _missing_fields(c: dict) -> list:
    names = []
    if not c["base_url"]:
        names.append("Base URL")
    if not c["api_key"]:
        names.append("API Key")
    if not c["model"]:
        names.append("模型名")
    return names


def ping(base_url=None, api_key=None, model=None, timeout: float = None) -> dict:
    """连通测试, 不抛异常。

    返回 {"configured": bool, "ok": bool, "message": str, "detail": dict}。
    detail 含 url / model / status / elapsed_ms / 服务端原文 / 建议, 供前端诊断面板展示。
    """
    timeout = timeout if timeout else _timeout(TIMEOUT_PING)
    c = _cfg_from(base_url, api_key, model)
    missing = _missing_fields(c)
    if missing:
        return {
            "configured": False, "ok": False,
            "message": "未配置：" + "、".join(missing) + " 为空，AI 功能已关闭",
            "detail": {"kind": "not_configured", "missing": missing,
                       "hint": "三项都填齐并保存后才会出现 AI 入口。"},
        }

    t0 = time.time()
    try:
        chat([{"role": "user", "content": "hi"}], max_tokens=5,
             timeout=timeout, cfg=c, fallback=False)
    except AIError as e:
        detail = dict(e.detail)
        detail.setdefault("elapsed_ms", int((time.time() - t0) * 1000))
        detail.setdefault("hint", "")
        detail.setdefault("kind", "unknown")
        detail["url"] = detail.get("url") or f"{c['base_url']}/chat/completions"
        return {"configured": True, "ok": False, "message": str(e), "detail": detail}
    return {
        "configured": True, "ok": True,
        "message": "已配置，连接正常",
        "detail": {
            "kind": "ok",
            "url": f"{c['base_url']}/chat/completions",
            "model": c["model"],
            "key_masked": _mask_key(c["api_key"]),
            "elapsed_ms": int((time.time() - t0) * 1000),
            "notes": c["base_notes"],
        },
    }
