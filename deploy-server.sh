#!/usr/bin/env bash
# 球译 — 服务器端一键部署脚本（在腾讯云服务器上运行，不是本地）
# 用法：cd /home/ubuntu/jingcai && ./deploy-server.sh
# 作用：拉最新代码 → 构建 → 同步 standalone 静态资源/环境变量 → 重启 → 自检
set -euo pipefail

APP_DIR="/home/ubuntu/jingcai"
PM2_NAME="jingcai"
PORT="3000"

cd "$APP_DIR"

echo "▶ 1/5 拉取最新代码…"
git pull

echo "▶ 2/5 构建（Next.js）…"
npm run build

echo "▶ 3/5 同步 standalone 静态资源与环境变量…"
# standalone 服务器从自己目录下读静态文件，必须每次 build 后手动同步，否则样式 404
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
cp -r public .next/standalone/public
# 把环境变量（含 ODDS_API_KEY）带进 standalone，否则参考盘读不到 key
if [ -f .env.local ]; then
  cp .env.local .next/standalone/.env.local
fi

echo "▶ 4/5 重启服务…"
pm2 restart "$PM2_NAME"
sleep 2

echo "▶ 5/5 自检 CSS 是否可访问…"
CSS_PATH=$(curl -s "http://127.0.0.1:${PORT}/" | grep -o '/_next/static/[^"]*\.css' | head -1 || true)
if [ -z "$CSS_PATH" ]; then
  echo "⚠ 未在首页找到 CSS 引用，请手动打开页面确认。"
  exit 0
fi
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}${CSS_PATH}")
if [ "$CODE" = "200" ]; then
  echo "✓ 部署完成，样式正常（CSS → 200）"
else
  echo "✗ CSS 返回 $CODE，样式可能仍异常；检查第 3 步 standalone 静态目录同步。"
  exit 1
fi
