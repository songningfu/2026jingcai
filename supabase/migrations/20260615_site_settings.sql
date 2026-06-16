create table if not exists site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- showcase_predictions: 管理员配置的未登录展示卡片
insert into site_settings (key, value) values (
  'showcase_predictions',
  '[
    {"home":"法国","away":"摩洛哥","label":"比分命中","result":"2:0"},
    {"home":"阿根廷","away":"克罗地亚","label":"比分命中","result":"3:0"},
    {"home":"英格兰","away":"法国","label":"胜负命中","result":"法国胜"},
    {"home":"葡萄牙","away":"摩洛哥","label":"胜负命中","result":"葡萄牙胜"}
  ]'::jsonb
) on conflict (key) do nothing;
