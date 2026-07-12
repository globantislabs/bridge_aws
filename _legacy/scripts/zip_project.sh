#!/bin/bash
# Zip the Bridge project for download, including .env with values.
# Excludes build artifacts, deps, logs, and IDE/system folders.

set -e

PROJECT_DIR="/home/z/my-project"
OUT_DIR="/home/z/my-project/download"
OUT_FILE="$OUT_DIR/bridge-project.zip"

mkdir -p "$OUT_DIR"

# Remove any previous archive
rm -f "$OUT_FILE"

# Zip everything EXCEPT: node_modules, .next, .git, dev.log, tool-results,
# .zscripts, .z-ai-config, tsconfig.tsbuildinfo, server.log, upload/, skills/,
# AND the db/custom.db file (let Prisma create it fresh on each machine to
# avoid Windows read-only zip extraction issues).
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
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  > /tmp/zip.log 2>&1

echo "=========================================="
echo "Zip created: $OUT_FILE"
echo "Size: $(du -h "$OUT_FILE" | cut -f1)"
echo "=========================================="
echo "Top-level entries in archive:"
unzip -l "$OUT_FILE" | head -30
echo "..."
echo "Total entries: $(unzip -l "$OUT_FILE" | tail -1)"
echo ""
echo "Confirm .env is included:"
unzip -l "$OUT_FILE" | grep -E "^.{1,30}\.env$" || echo "(.env NOT found in archive!)"
