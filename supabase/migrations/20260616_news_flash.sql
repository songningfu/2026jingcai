-- 快讯表：RSS 抓取 + DeepSeek 过滤后自动入库
create table if not exists news_flash (
  id           bigserial primary key,
  title        text not null,
  summary      text not null,             -- DeepSeek 中文摘要
  source_name  text not null,             -- 来源名称，如 "BBC Sport"
  source_url   text,                      -- 原文链接
  published_at timestamptz not null,      -- 原文发布时间
  tags         text[] default '{}',       -- 关联球队/关键词，如 ["西班牙","德国"]
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create index if not exists idx_news_published on news_flash (published_at desc);
create index if not exists idx_news_tags on news_flash using gin (tags);

-- 去重索引：同源同标题不重复入库
create unique index if not exists idx_news_dedup on news_flash (source_name, title);

-- RLS
alter table news_flash enable row level security;
create policy "public read" on news_flash for select using (is_active = true);
