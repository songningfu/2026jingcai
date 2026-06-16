"""
世界杯快讯抓手
RSS 抓取 → DeepSeek 过滤+中文摘要 → POST 到 /api/news/ingest

依赖：pip install feedparser httpx
"""

import os
import json
import time
import hashlib
import feedparser
import httpx
from datetime import datetime, timezone, timedelta

# ── RSS 源（全部有公开 RSS，无需登录）─────────────────────────
RSS_SOURCES = [
    # 国际
    {"name": "BBC Sport Football", "url": "https://feeds.bbci.co.uk/sport/football/rss.xml"},
    {"name": "ESPN FC",            "url": "https://www.espn.com/espn/rss/soccer/news"},
    {"name": "Goal.com",           "url": "https://www.goal.com/feeds/en/news"},
    {"name": "FIFA News",          "url": "https://www.fifa.com/rss/en/news.xml"},
    # 国内
    {"name": "新浪体育",           "url": "https://rss.sina.com.cn/sports/global/football.xml"},
    {"name": "虎扑足球",           "url": "https://www.hupuapp.com/rss/football.xml"},
]

# 世界杯 48 队关键词（用于初筛，避免喂给 DeepSeek 无关内容）
WC_KEYWORDS = [
    "world cup", "worldcup", "wc2026", "fifa 2026", "美加墨", "世界杯",
    "argentina", "france", "brazil", "germany", "spain", "england",
    "portugal", "netherlands", "belgium", "croatia", "italy", "japan",
    "mexico", "usa", "canada", "morocco", "senegal", "nigeria",
    "australia", "south korea", "iran", "saudi arabia", "ecuador",
    "uruguay", "colombia", "chile", "sweden", "denmark", "switzerland",
    "poland", "czechia", "turkey", "austria", "scotland", "romania",
    "ivory coast", "cameroon", "ghana", "mali", "egypt", "tunisia",
    "algeria", "new zealand", "indonesia", "iraq", "qatar", "uae",
    "阿根廷", "法国", "巴西", "德国", "西班牙", "英格兰", "葡萄牙",
    "荷兰", "比利时", "克罗地亚", "意大利", "日本", "墨西哥", "美国",
    "加拿大", "摩洛哥", "塞内加尔", "尼日利亚", "澳大利亚", "韩国",
    "伊朗", "沙特", "厄瓜多尔", "乌拉圭", "哥伦比亚", "智利", "瑞典",
    "丹麦", "瑞士", "波兰", "捷克", "土耳其", "奥地利", "苏格兰",
    "罗马尼亚", "科特迪瓦", "喀麦隆", "加纳", "马里", "埃及", "突尼斯",
    "阿尔及利亚", "新西兰", "印尼", "伊拉克",
]

INGEST_URL = os.environ["INGEST_URL"]        # https://xxx/api/news/ingest?secret=xxx
DEEPSEEK_API_KEY = os.environ["DEEPSEEK_API_KEY"]
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")


def fetch_rss(source: dict, max_age_hours: int = 12) -> list[dict]:
    """抓取单个 RSS 源，返回近 N 小时内的条目"""
    try:
        feed = feedparser.parse(source["url"])
    except Exception as e:
        print(f"[rss] 抓取失败 {source['name']}: {e}")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    items = []
    for entry in feed.entries[:30]:
        # 解析发布时间
        pub = None
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            pub = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            pub = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
        else:
            pub = datetime.now(timezone.utc)

        if pub < cutoff:
            continue

        title = entry.get("title", "").strip()
        summary = entry.get("summary", entry.get("description", "")).strip()
        link = entry.get("link", "")

        if not title:
            continue

        items.append({
            "title": title,
            "raw_summary": summary[:500],
            "source_name": source["name"],
            "source_url": link,
            "published_at": pub.isoformat(),
        })

    return items


def is_wc_related(title: str, summary: str) -> bool:
    """快速关键词初筛，减少 DeepSeek 调用"""
    text = (title + " " + summary).lower()
    return any(kw.lower() in text for kw in WC_KEYWORDS)


def deepseek_filter_and_summarize(items: list[dict]) -> list[dict]:
    """
    把一批候选条目发给 DeepSeek，让它：
    1. 过滤掉与世界杯/球队无关的
    2. 将标题+摘要翻译/改写成中文简讯
    3. 提取相关球队 tags
    返回过滤+处理后的列表
    """
    if not items:
        return []

    entries_text = "\n".join(
        f"{i+1}. [{item['source_name']}] {item['title']}\n   {item['raw_summary']}"
        for i, item in enumerate(items)
    )

    prompt = f"""你是2026年美加墨世界杯的新闻编辑助手。下面是从各新闻源抓取的体育新闻条目（共{len(items)}条）。

请按如下规则处理：
1. 只保留与2026世界杯、世界杯参赛球队、世界杯球员、FIFA相关的条目
2. 对每条保留的新闻，用简洁的中文重写标题（20字以内）和摘要（50字以内）
3. 提取涉及的球队名（中文），最多3个
4. 严禁输出任何投注建议、赔率分析、胜负倾向

以 JSON 数组格式返回，每项结构：
{{"idx": <原序号1起>, "title": "中文标题", "summary": "中文摘要", "tags": ["球队1","球队2"]}}

如果没有任何相关条目，返回空数组 []。只输出 JSON，不要有其他文字。

新闻条目：
{entries_text}"""

    try:
        resp = httpx.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
                "max_tokens": 2000,
            },
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        # DeepSeek 有时返回 {"items": [...]} 有时直接返回 [...]
        result_list = parsed if isinstance(parsed, list) else parsed.get("items", parsed.get("data", []))
    except Exception as e:
        print(f"[deepseek] 调用失败: {e}")
        return []

    # 把 DeepSeek 结果 merge 回原始数据
    out = []
    for r in result_list:
        idx = r.get("idx", 0) - 1
        if 0 <= idx < len(items):
            orig = items[idx]
            out.append({
                "title": r.get("title", orig["title"]),
                "summary": r.get("summary", ""),
                "source_name": orig["source_name"],
                "source_url": orig["source_url"],
                "published_at": orig["published_at"],
                "tags": r.get("tags", []),
            })
    return out


def post_to_ingest(items: list[dict]) -> None:
    if not items:
        print("[ingest] 无新条目，跳过")
        return
    try:
        resp = httpx.post(INGEST_URL, json={"items": items}, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        print(f"[ingest] 写入完成: inserted={result.get('inserted')}, skipped={result.get('skipped')}")
    except Exception as e:
        print(f"[ingest] POST 失败: {e}")


def main():
    print(f"[start] {datetime.now(timezone.utc).isoformat()}")

    all_candidates = []
    for source in RSS_SOURCES:
        items = fetch_rss(source, max_age_hours=12)
        # 关键词初筛
        filtered = [i for i in items if is_wc_related(i["title"], i["raw_summary"])]
        print(f"[rss] {source['name']}: 抓到 {len(items)} 条，初筛留 {len(filtered)} 条")
        all_candidates.extend(filtered)

    if not all_candidates:
        print("[done] 无候选条目")
        return

    # 去重（同标题）
    seen = set()
    deduped = []
    for item in all_candidates:
        key = hashlib.md5(item["title"].lower().encode()).hexdigest()
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    print(f"[dedup] 去重后剩 {len(deduped)} 条，发给 DeepSeek 处理")

    # 分批处理，每批最多 15 条（避免 prompt 过长）
    batch_size = 15
    final_items = []
    for i in range(0, len(deduped), batch_size):
        batch = deduped[i:i+batch_size]
        processed = deepseek_filter_and_summarize(batch)
        print(f"[deepseek] 批次 {i//batch_size+1}: 输入 {len(batch)} 条，输出 {len(processed)} 条")
        final_items.extend(processed)
        if i + batch_size < len(deduped):
            time.sleep(2)  # 避免限流

    print(f"[result] 最终 {len(final_items)} 条快讯准备写入")
    post_to_ingest(final_items)
    print(f"[done] {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
