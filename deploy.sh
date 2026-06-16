#!/bin/bash
set -e

SERVER="ubuntu@43.161.217.43"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="/tmp/jingcai-deploy"
PACK="$HOME/Desktop/jingcai-deploy.tar.gz"

echo "▶ 1/4 构建..."
cd "$PROJECT_DIR"
npm run build

echo "▶ 2/4 打包产物..."
rm -rf "$TMP"
cp -r .next/standalone "$TMP"
cp -r .next/static "$TMP/.next/static"
cp -r public "$TMP/public"
tar -czf "$PACK" -C /tmp jingcai-deploy
echo "   打包完成：$PACK"

echo "▶ 3/4 上传..."
scp "$PACK" "$SERVER:/home/ubuntu/"
scp .env.local "$SERVER:/home/ubuntu/"
echo "   上传完成"

echo "▶ 4/4 服务器部署..."
ssh "$SERVER" bash <<'REMOTE'
set -e
cd /home/ubuntu
tar -xzf jingcai-deploy.tar.gz
rm -rf jingcai
mv jingcai-deploy jingcai
cp .env.local jingcai/.env.local
pm2 delete jingcai 2>/dev/null || true
pm2 start /home/ubuntu/jingcai/server.js --name jingcai
pm2 save
echo "✓ 部署完成，访问 http://43.161.217.43"
REMOTE
