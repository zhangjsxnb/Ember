#!/usr/bin/env python3
"""
小红书解析 API 服务
供 Ember 前端调用，返回真实解析数据。
运行: python xhs-api-server.py
端口: 8000
"""

import json
import ssl
import re
import urllib.request
import urllib.parse
import subprocess
import tempfile
import os
import shutil
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

# ── 配置 ─────────────────────────────
DEEPSEEK_API_KEY = "sk-184f5a31a8e841a5abb427a82481a763"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

app = FastAPI(title="XHS Parse API")

# 允许前端跨域调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

COOKIES_PATH = os.path.expanduser("~/cookies.json")
# Cookie 缓存
_cookie_str = None

def get_cookie_str():
    global _cookie_str
    if _cookie_str is not None:
        return _cookie_str
    if not os.path.exists(COOKIES_PATH):
        raise RuntimeError(f"Cookie 文件不存在: {COOKIES_PATH}")
    with open(COOKIES_PATH, encoding="utf-8") as f:
        cookies = json.load(f)
    _cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    return _cookie_str

def fetch_html(url: str, timeout: int = 15) -> str:
    """用 Cookie 认证获取小红书页面 HTML"""
    cookie_str = get_cookie_str()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url)
    req.add_header("Cookie", cookie_str)
    req.add_header("User-Agent", (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ))
    req.add_header("Referer", "https://www.xiaohongshu.com/")
    req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    req.add_header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

    resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
    # 处理短链接重定向
    final_url = resp.geturl()
    html = resp.read().decode("utf-8", errors="ignore")
    return html, final_url

def resolve_short_link(url: str) -> str:
    """解析 xhslink.com 短链接，返回最终 URL（使用 GET，HEAD 部分服务器不响应）"""
    if "xhslink.com" not in url:
        return url
    try:
        cookie_str = get_cookie_str()
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # 用 GET 而不是 HEAD（小红书短链接对 HEAD 响应不正常）
        req = urllib.request.Request(url)
        req.add_header("Cookie", cookie_str)
        req.add_header("User-Agent", (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ))
        req.add_header("Referer", "https://www.xiaohongshu.com/")
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        final = resp.geturl()
        resp.close()
        return final
    except Exception as e:
        raise RuntimeError(f"短链接解析失败: {e}")

def transcribe_video(video_url: str) -> str:
    """下载视频，提取音频，转录文字"""
    if not video_url:
        return ""

    temp_dir = tempfile.mkdtemp(prefix="xhs_")
    video_path = os.path.join(temp_dir, "video.mp4")
    audio_path = os.path.join(temp_dir, "audio.mp3")

    try:
        # 1. 下载视频
        print(f"[转录] 下载视频: {video_url[:80]}...")
        req = urllib.request.Request(video_url)
        req.add_header("User-Agent", (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ))
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(video_path, "wb") as f:
                shutil.copyfileobj(resp, f)

        # 2. 提取音频（转MP3）
        print(f"[转录] 提取音频...")
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "libmp3lame", "-q:a", "2",
            audio_path
        ], check=True, capture_output=True)

        # 3. 用 whisper 转录
        print(f"[转录] 开始转录（使用 base 模型）...")
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(audio_path, language="zh", fp16=False)

        transcript = result["text"].strip()
        print(f"[转录] 完成，转录文字长度: {len(transcript)}")

        # 4. 用 DeepSeek 加标点和修正（让转录可读）
        if transcript and DEEPSEEK_API_KEY:
            try:
                print(f"[转录] 用 DeepSeek 润色文字...")
                clean_payload = {
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": (
                        "你是一个语音转录后处理助手。下面是语音识别出的文字，没有标点和分段。"
                        "请直接加上标点符号、分段，修正明显同音错别字，不额外解释、不添加内容。\n\n"
                        + transcript
                    )}],
                    "temperature": 0.1,
                    "max_tokens": 2000
                }
                payload_bytes = json.dumps(clean_payload).encode('utf-8')
                req = urllib.request.Request(DEEPSEEK_API_URL)
                req.add_header('Content-Type', 'application/json')
                req.add_header('Authorization', f'Bearer {DEEPSEEK_API_KEY}')
                with urllib.request.urlopen(req, data=payload_bytes, timeout=30) as resp:
                    clean_result = json.loads(resp.read().decode('utf-8'))
                cleaned = clean_result['choices'][0]['message']['content'].strip()
                if cleaned:
                    transcript = cleaned
                    print(f"[转录] 润色完成，长度: {len(transcript)}")
            except Exception as e:
                print(f"[转录] 润色失败（用原始文本）: {e}")

        return transcript

    except Exception as e:
        print(f"[转录] 失败: {e}")
        return f"[转录失败: {e}]"
    finally:
        # 清理临时文件
        for p in [video_path, audio_path]:
            if os.path.exists(p):
                os.remove(p)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)



def ai_analyze_content(data: dict, deepseek_key: str) -> str:
    """调用 DeepSeek API 生成结构化技术笔记（直接输出 Markdown 折叠卡片）"""
    title = data.get('title', '')
    content = data.get('content', '')
    transcript = data.get('transcript', '')
    stats = data.get('stats', {})
    tags = data.get('tags', [])
    images = data.get('images', [])
    video = data.get('video', '')

    # 构建带图片的文本
    text = f"""标题：{title}

原文内容：
{content}
"""
    if images:
        text += f"\n配图列表（封面图链接在第一张）："
        for img in images[:5]:
            text += f"\n- {img}"
    if transcript:
        text += f"\n\n视频转录全文（包含完整制作过程细节）：\n{transcript}"

    prompt = f"""你是一个真实的人在整理笔记，不是AI。写出来的东西要像人写的。

把下面这篇小红书笔记提炼成一张结构化知识卡片。

要求：
- 用 `> [!tip]-` 开头，第一行写一句核心总结
- 内部用 `> **标题**` 分组，2-4 组
- 用 `> - ` 或 `> 1. ` 组织具体内容
- 有封面图链接就放末尾 `> ![描述](图片URL)`
- 只输出卡片本身，不讲开场白、不贴标签、不要"根据内容分析""可以看到""值得注意的是"这类废话
- 数据要准，不要编

根据内容选合适结构（示意）：
- 食谱→配方/流程/技巧
- 旅游→行程/交通/住宿/避坑
- 穿搭→单品/搭配/场景
- 技巧→问题/方案/注意
- 观点→观点/理由/启发
- 其他→2-4个最有价值的点

{text}

标签：{', '.join(tags) if tags else '无'}
互动：{stats}"""

    try:
        import urllib.request
        payload = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
            "max_tokens": 2000
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request('https://api.deepseek.com/v1/chat/completions')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {deepseek_key}')
        with urllib.request.urlopen(req, data=data_bytes, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        return result['choices'][0]['message']['content']
    except Exception as e:
        print(f'[AI分析] 失败: {e}')
        return ''


def parse_initial_state(html: str) -> dict:
    """从 HTML 中提取 window.__INITIAL_STATE__ 并解析（健壮版）"""
    marker = "window.__INITIAL_STATE__"
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("无法从页面提取 __INITIAL_STATE__")

    # 找到 = 号后的 JSON 开始位置
    eq_idx = html.find("=", idx)
    if eq_idx == -1:
        raise ValueError("无法解析 __INITIAL_STATE__ 位置")

    # 跳过空格和换行
    json_start = eq_idx + 1
    while json_start < len(html) and html[json_start] in " \t\r\n":
        json_start += 1

    if json_start >= len(html) or html[json_start] != "{":
        raise ValueError("__INITIAL_STATE__ 格式异常")

    # 用栈匹配花括号，精确提取 JSON
    depth = 0
    in_string = False
    escape_next = False
    i = json_start

    while i < len(html):
        ch = html[i]
        if escape_next:
            escape_next = False
            i += 1
            continue
        if ch == "\\" and in_string:
            escape_next = True
            i += 1
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
        elif not in_string:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    raw = html[json_start:i+1]
                    raw = raw.replace("undefined", "null")
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError as e:
                        raise ValueError(f"JSON 解析失败: {e}")
        i += 1

    raise ValueError("无法完整提取 __INITIAL_STATE__")

def extract_note_data(state: dict, note_id: str) -> dict:
    """从 __INITIAL_STATE__ 中提取笔记数据"""
    note_map = state.get("note", {}).get("noteDetailMap", {})
    note_entry = note_map.get(note_id, {})
    note = note_entry.get("note")
    if not note:
        # 尝试其他可能的路径
        note = state.get("note", {}).get("noteDetail", {})
    if not note:
        raise ValueError("找不到笔记数据，链接可能已失效或 Cookie 已过期")

    user = note.get("user", {})
    interact = note.get("interactInfo", {})
    image_list = note.get("imageList", [])
    video_info = note.get("video", {})
    tag_list = note.get("tags", [])

    # 提取图片 URL
    images = []
    for img in image_list:
        url = (img.get("urlDefault") or img.get("urlPre") or
               img.get("url") or "").split("?")[0]
        if url:
            images.append(url)

    # 提取视频信息（兼容多种结构）
    video = None
    if isinstance(video_info, str) and video_info.startswith("http"):
        video = video_info
    elif isinstance(video_info, dict):
        # 尝试直接取 URL 字段
        video = (video_info.get("urlDefault") or
                 video_info.get("h265VideoUrl") or
                 video_info.get("h264VideoUrl") or
                 video_info.get("masterUrl") or
                 video_info.get("url") or "")
        if not video and video_info.get("media"):
            media = video_info["media"]
            stream = media.get("stream", {})
            h264 = stream.get("h264", [])
            if h264:
                video = h264[0].get("masterUrl") or h264[0].get("url") or ""
            if not video:
                h265 = stream.get("h265", [])
                if h265:
                    video = h265[0].get("masterUrl") or h265[0].get("url") or ""
        # 如果是字符串类型的 video 就保留，否则清空
        if not isinstance(video, str):
            video = ""

    return {
        "title": note.get("title", ""),
        "content": note.get("desc", ""),
        "author": user.get("nickname", ""),
        "authorId": user.get("userId", ""),
        "date": _format_timestamp(note.get("time")),
        "stats": {
            "likes": str(interact.get("likedCount", 0)),
            "collects": str(interact.get("collectedCount", 0)),
            "comments": str(interact.get("commentCount", 0)),
        },
        "tags": [t.get("name", "").lstrip("#") for t in tag_list if t.get("name")],
        "images": images,
        "video": video,
        "type": note.get("type", "normal"),
        "noteId": note_id,
    }

def _format_timestamp(ts):
    if not ts:
        return ""
    try:
        from datetime import datetime
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
        return str(ts)[:10]
    except Exception:
        return str(ts)[:10]

class ParseRequest(BaseModel):
    url: str

def extract_url_from_text(text: str) -> str:
    """从任意文本中提取小红书 URL（支持 xhslink.com 和 xiaohongshu.com）"""
    # 先尝试直接匹配 URL 模式
    patterns = [
        r'https?://[^\s<>"\']*(?:xhslink\.com|xiaohongshu\.com)[^\s<>"\']*',
        r'(?:https?://)?[^\s<>"\']*(?:xhslink\.com|xiaohongshu\.com)[^\s<>"\']*',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for m in matches:
            if "xhslink.com" in m or "xiaohongshu.com" in m:
                if not m.startswith("http"):
                    m = "https://" + m
                return m
    return text.strip()

@app.post("/api/parse")
def parse_xhs(req: ParseRequest):
    raw_input = req.url.strip()
    if not raw_input:
        raise HTTPException(status_code=400, detail="请输入链接")

    # 从输入中提取真正的 URL
    url = extract_url_from_text(raw_input)

    # 步骤1：解析短链接，获取最终 URL
    try:
        final_url = resolve_short_link(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"短链接解析失败: {e}")

    # 步骤2：获取页面 HTML
    try:
        html, actual_final_url = fetch_html(final_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取页面失败: {e}")

    # 步骤3：解析 __INITIAL_STATE__（后面会复用）
    try:
        state = parse_initial_state(html)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"{e}，请在浏览器重新登录小红书并导出最新 Cookie")

    # 步骤4：提取 note_id（先试 URL，再从 state 里拿）
    note_id = ""
    combined_urls = f"{final_url} {actual_final_url or ''}"
    patterns = [
        r"/explore/([a-zA-Z0-9]+)",
        r"/discovery/item/([a-zA-Z0-9]+)",
        r"noteId=([a-zA-Z0-9]+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, combined_urls)
        if m:
            note_id = m.group(1)
            break

    # 从 state 里提取（URL 里没有的情况）
    if not note_id:
        note_map = state.get("note", {}).get("noteDetailMap", {})
        if note_map:
            note_id = list(note_map.keys())[0]

    if not note_id:
        raise HTTPException(status_code=400, detail="无法从链接中提取笔记 ID")

    # 步骤5：提取笔记数据
    try:
        data = extract_note_data(state, note_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    data["url"] = actual_final_url or final_url

    # 步骤6：如果是视频，进行语音转录
    if data.get("video") and data.get("type") == "video":
        print(f"[解析] 检测到视频，开始转录...")
        transcript = transcribe_video(data["video"])
        data["transcript"] = transcript
        print(f"[解析] 转录完成")

    return {"success": True, **data}

@app.get("/health")
def health():
    return {"status": "ok", "cookies": "found" if os.path.exists(COOKIES_PATH) else "missing"}

# ── 保存到 Obsidian ───────────────────────────────────

OBSIDIAN_DIR = os.path.expanduser(r"~\Documents\Obsidian Vault\xhs")

class SaveRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    title: str
    content: str
    author: str = ""
    date: str = ""
    tags: list = []
    url: str = ""
    stats: dict = {}
    images: list = []
    noteId: str = ""

def _safe_filename(title: str, max_len: int = 30) -> str:
    """生成安全的文件名（无日期，与内容关联）"""
    # 去掉特殊字符，保留中文、英文、数字、空格
    cleaned = re.sub(r'[^\w\u4e00-\u9fa5\s]', ' ', title)
    # 合并多个空格
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # 截断
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip()
    # 替换空格为下划线
    return cleaned.replace(' ', '_') + ".md"

def _parse_count(s) -> int:
    """把 '5万' / '4.5万' / '747' 这样的字符串解析成整数"""
    if not s:
        return 0
    s = str(s).strip()
    import re
    if "亿" in s:
        return int(float(s.replace("亿", "")) * 100000000)
    if "万" in s:
        return int(float(s.replace("万", "")) * 10000)
    m = re.search(r"\d+", s)
    return int(m.group()) if m else 0


def _format_markdown(data: dict) -> str:
    """格式化为 Obsidian 友好的 Markdown（无 frontmatter，Peter Thiel 风格）"""
    title = data.get("title", "无标题")
    content = data.get("content", "")
    author = data.get("author", "")
    date = data.get("date", "")
    tags = data.get("tags", [])
    url = data.get("url", "")
    stats = data.get("stats", {})
    note_id = data.get("noteId", "")

    # 核心洞察（标题即洞察）
    lines = [f"# {title}", ""]

    # 核心论点（2-3句话，直接给判断）
    if content:
        # 取前200字作为核心论点
        summary = content[:200].strip()
        if len(content) > 200:
            summary += "…"
        lines.append(summary)
        lines.append("")

    # 与我的关联（通用角度）
    lines.append("**与我的关联：** 待补充——此笔记来自小红书，涉及烘焙/生活技巧/经验分享，可根据个人需求深挖或跳过。")
    lines.append("")

    # 值得深挖吗
    likes = _parse_count(stats.get("likes", 0))
    collects = _parse_count(stats.get("collects", 0))
    if collects > likes * 0.5:
        worth = "是——收藏数高，说明实用性强。"
    else:
        worth = "可选——点赞收藏一般，快速浏览即可。"
    lines.append(f"**值得深挖吗：** {worth}")
    lines.append("")

    # 详情折叠区
    lines.append("> [!tip]- 详情")
    lines.append(">")
    if content:
        # 清理内容中的话题标签
        clean_content = re.sub(r'#[^#]+#', '', content)
        for line in clean_content.split('\n'):
            if line.strip():
                lines.append(f"> {line}")
    lines.append("")

    # 笔记属性
    lines.append("> [!info]- 笔记属性")
    lines.append(">")
    lines.append(f"> - **来源**: 小红书 · {author}")
    if note_id:
        lines.append(f"> - **帖子ID**: {note_id}")
    if url:
        lines.append(f"> - **链接**: {url}")
    if date:
        lines.append(f"> - **日期**: {date}")
    if stats:
        parts = []
        if stats.get("likes"):
            parts.append(f"{stats['likes']}赞")
        if stats.get("collects"):
            parts.append(f"{stats['collects']}收藏")
        if stats.get("comments"):
            parts.append(f"{stats['comments']}评论")
        if parts:
            lines.append(f"> - **互动**: {' / '.join(parts)}")
    if tags:
        lines.append(f"> - **标签**: {', '.join(tags)}")

    return "\n".join(lines)

@app.post("/api/save-to-obsidian")
def save_to_obsidian(req: SaveRequest):
    import pathlib

    # 确保目录存在
    obs_dir = pathlib.Path(OBSIDIAN_DIR)
    obs_dir.mkdir(parents=True, exist_ok=True)

    # 生成文件名
    filename = _safe_filename(req.title)
    filepath = obs_dir / filename

    # 如果文件已存在，加序号
    counter = 1
    base_path = obs_dir / filename
    while filepath.exists():
        stem = base_path.stem
        filepath = obs_dir / f"{stem}_{counter}{base_path.suffix}"
        counter += 1

    # 生成 Markdown 内容（先尝试 AI 分析，失败则用原始格式）
    data = req.model_dump()
    ai_md = None
    try:
        if DEEPEEK_API_KEY and DEEPEEK_API_KEY != "YOUR_DEEPSEEK_KEY_HERE":
            ai_result = ai_analyze_content(data, DEEPEEK_API_KEY)
            if ai_result:
                ai_md = ai_result
    except Exception:
        pass

    if ai_md:
        content = ai_md
    else:
        content = _format_markdown(data)

    # 写入文件
    filepath.write_text(content, encoding="utf-8")

    return {
        "ok": True,
        "file": str(filepath),
        "relpath": f"xhs/{filename}",
    }



@app.post('/api/ai-generate')
async def ai_generate(request: Request):
    """调用 DeepSeek API 生成内容"""
    try:
        body = await request.json()
    except Exception as e:
        print(f"[AI生成] JSON解析失败: {e}")
        raise HTTPException(status_code=400, detail=f'请求格式错误: {e}')

    prompt = body.get('prompt', '')
    if not prompt:
        raise HTTPException(status_code=400, detail='prompt 不能为空')

    try:
        import urllib.request
        payload = {
            'model': 'deepseek-chat',
            'messages': [
                {'role': 'system', 'content': '你是一个小红书笔记写手，根据用户提供的想法，直接生成小红书风格的笔记文案。用口语化的中文，结尾加相关话题标签。不是回答问题，不是做分析，是写一篇能发出去的笔记。'},
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.7,
            'max_tokens': 2000
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(DEEPSEEK_API_URL)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {DEEPSEEK_API_KEY}')

        with urllib.request.urlopen(req, data=data_bytes, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        ai_text = result['choices'][0]['message']['content']
        return {'ok': True, 'result': ai_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f'AI 生成失败: {e}')


@app.post('/api/ai-analyze-parsed')
def ai_analyze_parsed(req: SaveRequest):
    """对已解析的小红书内容生成结构化笔记卡片"""
    data = req.model_dump()
    result = ai_analyze_content(data, DEEPSEEK_API_KEY)
    if result:
        return {'ok': True, 'result': result}
    return {'ok': False, 'error': 'AI分析失败'}


class SaveAiNoteRequest(BaseModel):
    title: str
    content: str

@app.post('/api/save-ai-note')
def save_ai_note(req: SaveAiNoteRequest):
    """将 AI 生成的结构化笔记保存到 Obsidian"""
    import pathlib

    obs_dir = pathlib.Path(OBSIDIAN_DIR)
    obs_dir.mkdir(parents=True, exist_ok=True)

    filename = _safe_filename(req.title)
    filepath = obs_dir / filename

    counter = 1
    base_path = obs_dir / filename
    while filepath.exists():
        stem = base_path.stem
        filepath = obs_dir / f"{stem}_{counter}{base_path.suffix}"
        counter += 1

    filepath.write_text(req.content, encoding="utf-8")

    return {
        "ok": True,
        "file": str(filepath),
        "relpath": f"xhs/{filename}",
    }


# ── 素材语料库 ─────────────────────────────────

MATERIALS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xhs-materials.json")

def _load_materials() -> list:
    if not os.path.exists(MATERIALS_FILE):
        return []
    try:
        with open(MATERIALS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def _save_materials(data: list):
    with open(MATERIALS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class MaterialSaveRequest(BaseModel):
    title: str = ""
    content: str = ""
    author: str = ""
    date: str = ""
    tags: list = []
    url: str = ""
    stats: dict = {}
    images: list = []
    noteId: str = ""
    transcript: str = ""

@app.post('/api/materials/save')
def material_save(req: MaterialSaveRequest):
    mats = _load_materials()
    # 去重：同一 noteId 或同一 url 不重复添加
    for m in mats:
        if (req.noteId and m.get("noteId") == req.noteId) or (req.url and m.get("url") == req.url):
            return {"ok": False, "error": "该笔记已在素材库中"}
    entry = req.model_dump()
    entry["_id"] = f"mat_{len(mats)}_{int(__import__('time').time())}"
    entry["savedAt"] = __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M")
    mats.insert(0, entry)
    _save_materials(mats)
    return {"ok": True, "material": entry}

@app.get('/api/materials/list')
def material_list():
    return {"ok": True, "materials": _load_materials()}

@app.post('/api/materials/delete')
async def material_delete(request: Request):
    body = await request.json()
    mid = body.get("id", "")
    mats = _load_materials()
    mats = [m for m in mats if m.get("_id") != mid]
    _save_materials(mats)
    return {"ok": True}

@app.post('/api/materials/search')
async def material_search(request: Request):
    body = await request.json()
    q = body.get("q", "").lower()
    mats = _load_materials()
    if q:
        mats = [m for m in mats if q in m.get("title","").lower() or q in m.get("content","").lower() or any(q in t.lower() for t in m.get("tags",[]))]
    return {"ok": True, "materials": mats}


# ── 参考笔记生成 ─────────────────────────────────

class GenerateWithRefsRequest(BaseModel):
    prompt: str = ""
    mode: str = "auto"
    refIds: list = []
    refContents: list = []
    styleSample: str = ""

@app.post('/api/generate-with-refs')
def generate_with_refs(req: GenerateWithRefsRequest):
    """带参考素材+文风样本生成小红书笔记"""
    system_prompt = "你是一个小红书笔记写手，根据用户提供的想法直接生成小红书风格的笔记文案。用口语化的中文，结尾加相关话题标签。"

    # 使用前端传过来的参考素材内容
    if req.refContents:
        ref_text = "\n\n参考以下笔记的风格和内容（关注语气、结构、标签用法）："
        for r in req.refContents:
            title = r.get("title", "")
            content = r.get("content", "")[:500]
            tags = ", ".join(r.get("tags", []))
            ref_text += f"\n---\n标题：{title}\n内容：{content}\n标签：{tags}"
        system_prompt += ref_text

    # 添加文风样本
    if req.styleSample:
        system_prompt += f"\n\n下面是我的写作风格样本，请模仿这种语气和风格来写：\n{req.styleSample[:1000]}"

    try:
        payload = {
            'model': 'deepseek-chat',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': req.prompt}
            ],
            'temperature': 0.7,
            'max_tokens': 2000
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        r = urllib.request.Request(DEEPSEEK_API_URL)
        r.add_header('Content-Type', 'application/json')
        r.add_header('Authorization', f'Bearer {DEEPSEEK_API_KEY}')
        with urllib.request.urlopen(r, data=data_bytes, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        return {'ok': True, 'result': result['choices'][0]['message']['content']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'生成失败: {e}')


# ── 推荐话题 ─────────────────────────────────

class RecommendTopicsRequest(BaseModel):
    ideas: list = []

@app.post('/api/topics/recommend')
def recommend_topics(req: RecommendTopicsRequest):
    if not req.ideas:
        return {"ok": True, "topics": []}

    prompt = f"""根据以下灵感碎片，推荐2-4个适合写成小红书笔记的话题。
每个话题返回：话题标题 + 一句话说明为什么值得写。
用简洁格式，每条一行：
话题标题 | 说明

灵感碎片：
{chr(10).join(f'- {idea}' for idea in req.ideas)}"""

    try:
        payload = {
            'model': 'deepseek-chat',
            'messages': [
                {'role': 'system', 'content': '你是一个小红书选题助手，从灵感碎片中提炼值得写的笔记话题。简洁直接，不要废话。'},
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.5,
            'max_tokens': 800
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        r = urllib.request.Request(DEEPSEEK_API_URL)
        r.add_header('Content-Type', 'application/json')
        r.add_header('Authorization', f'Bearer {DEEPSEEK_API_KEY}')
        with urllib.request.urlopen(r, data=data_bytes, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        text = result['choices'][0]['message']['content']
        topics = []
        for line in text.strip().split('\n'):
            line = line.strip().lstrip('-* ')
            if '|' in line:
                parts = line.split('|', 1)
                topics.append({"title": parts[0].strip(), "desc": parts[1].strip()})
        if not topics:
            topics.append({"title": text[:80], "desc": ""})
        return {"ok": True, "topics": topics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'推荐失败: {e}')


# ── 文风学习 ─────────────────────────────────

STYLE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xhs-style.json")

def _load_style() -> dict:
    if not os.path.exists(STYLE_FILE):
        return {"samples": [], "summary": ""}
    try:
        with open(STYLE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"samples": [], "summary": ""}

def _save_style(data: dict):
    with open(STYLE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.post('/api/style/save-sample')
async def style_save_sample(request: Request):
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="样本不能为空")
    style = _load_style()
    style["samples"].insert(0, {"text": text[:2000], "addedAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M")})
    if len(style["samples"]) > 10:
        style["samples"] = style["samples"][:10]
    _save_style(style)
    return {"ok": True}

@app.get('/api/style/status')
def style_status():
    style = _load_style()
    return {"ok": True, "samplesCount": len(style["samples"]), "hasSummary": bool(style.get("summary"))}

@app.post('/api/style/analyze')
def style_analyze():
    """用 DeepSeek 分析文风样本，生成风格摘要"""
    style = _load_style()
    if not style["samples"]:
        return {"ok": False, "error": "没有样本可分析"}
    sample_texts = "\n---\n".join(s["text"] for s in style["samples"])
    prompt = f"""分析以下文本的写作风格特点，输出简洁的风格摘要（不超过200字）。
覆盖：语气（正式/口语）、句式特点、常用词汇、标点/emoji使用习惯、内容节奏。

文本样本：
{sample_texts}"""
    try:
        payload = {
            'model': 'deepseek-chat',
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.3,
            'max_tokens': 500
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        r = urllib.request.Request(DEEPSEEK_API_URL)
        r.add_header('Content-Type', 'application/json')
        r.add_header('Authorization', f'Bearer {DEEPSEEK_API_KEY}')
        with urllib.request.urlopen(r, data=data_bytes, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        summary = result['choices'][0]['message']['content'].strip()
        style["summary"] = summary
        _save_style(style)
        return {"ok": True, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'分析失败: {e}')

@app.get('/api/style/summary')
def style_get_summary():
    style = _load_style()
    return {"ok": True, "summary": style.get("summary", ""), "samples": style.get("samples", [])}

@app.post('/api/style/clear')
def style_clear():
    _save_style({"samples": [], "summary": ""})
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    print("🚀 XHS 解析 API 启动中...")
    print(f"   Cookie 文件: {COOKIES_PATH} ({'✅ 找到' if os.path.exists(COOKIES_PATH) else '❌ 缺失'})")
    print("   端点: POST http://localhost:8000/api/parse")
    print("   健康检查: GET http://localhost:8000/health")
    uvicorn.run(app, host="0.0.0.0", port=8000)
