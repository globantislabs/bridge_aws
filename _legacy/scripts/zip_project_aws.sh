#!/bin/bash
# Zip the Bridge project for AWS deployment.
# Excludes build artifacts, deps, logs, and IDE/system folders.
# Includes all AWS deployment files (Dockerfile.t3, docker-compose.t3.yml,
# aws/, .env.production, AWS_DEPLOY.md, AWS_QUICKSTART.md).

set -e

PROJECT_DIR="/home/z/my-project"
OUT_DIR="/home/z/my-project/download"
OUT_FILE="$OUT_DIR/bridge-project-final-aws.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

cd "$PROJECT_DIR"

zip -r "$OUT_FILE" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x ".git/*" \
  -x "dev.log" \
  -x "dev.out.log" \
  -x "server.log" \
  -x "tool-results/*" \
  -x ".zscripts/*" \
  -x ".z-ai-config/*" \
  -x ".claude/*" \
  -x "tsconfig.tsbuildinfo" \
  -x "upload/*" \
  -x "skills/*" \
  -x "download/*" \
  -x "db/custom.db" \
  -x "db/*.db" \
  -x "db/*.db-journal" \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x "aws/certbot/*" \
  > /tmp/zip.log 2>&1

echo "=========================================="
echo "Zip created: $OUT_FILE"
echo "Size: $(du -h "$OUT_FILE" | cut -f1)"
echo "=========================================="
echo "Key AWS deployment files in archive:"
unzip -l "$OUT_FILE" | grep -E "(Dockerfile.t3|docker-compose.t3|AWS_DEPLOY|AWS_QUICKSTART|deploy-t3|Caddyfile|\.env\.production|aws/)" | head -20
echo ""
echo "Total entries: $(unzip -l "$OUT_FILE" | tail -1)"
