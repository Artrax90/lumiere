#!/bin/bash
set -e

# Tizen TV build script for Lumiere
# Usage: npm run deploy:tizen [TV_IP]

TIZEN_HOME=/home/tizen-user/tizen-studio
export PATH=$TIZEN_HOME/tools/ide/bin:$PATH

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIZEN_DIR="$PROJECT_DIR/tizen-project"
BUILD_DIR="$TIZEN_DIR/.buildResult"
PROFILE="LumiereProfile"
TV_IP="${1:-${TV_IP:-}}"

echo "=== Lumiere Tizen TV Build ==="
echo ""

# Step 1: Build React app
echo "[1/3] Building React app..."
rm -rf "$TIZEN_DIR/webapp"
VITE_BUILD_MODE=tizen npx vite build --outDir "$TIZEN_DIR/webapp" --base ./ 2>&1 | tail -3
echo ""

# Step 2: Copy webapp to tizen-project root
echo "[2/3] Preparing Tizen project..."
rm -f "$TIZEN_DIR/index.html"
rm -rf "$TIZEN_DIR/assets"
cp "$TIZEN_DIR/webapp/index.html" "$TIZEN_DIR/"
cp -r "$TIZEN_DIR/webapp/assets" "$TIZEN_DIR/"
echo ""

# Step 3: Build .wgt
echo "[3/3] Building Tizen package..."
tizen build-web -- "$TIZEN_DIR" 2>&1 | tail -5
echo ""

# Try to create signed .wgt
WGT_FILE=""
if tizen package -t wgt -s "$PROFILE" -- "$BUILD_DIR" 2>&1; then
    WGT_FILE=$(find "$BUILD_DIR" -name "*.wgt" -type f 2>/dev/null | head -1)
fi

# If signing failed, create unsigned .wgt manually
if [ -z "$WGT_FILE" ]; then
    echo "Signing failed — creating unsigned .wgt (enable Developer Mode on TV to install)"
    cd "$BUILD_DIR"
    rm -f "$PROJECT_DIR/Lumiere-tizen.wgt"
    zip -r "$PROJECT_DIR/Lumiere-tizen.wgt" . -x "*.wgt" 2>&1 | tail -1
    cd "$PROJECT_DIR"
else
    cp "$WGT_FILE" "$PROJECT_DIR/Lumiere-tizen.wgt"
fi

echo ""
echo "Built: Lumiere-tizen.wgt ($(du -h "$PROJECT_DIR/Lumiere-tizen.wgt" | cut -f1))"
echo ""

# Install on TV (if requested)
if [ "$2" = "--install" ] || [ "$1" = "--install" ]; then
    if [ -z "$TV_IP" ] || [ "$TV_IP" = "--install" ]; then
        echo "Error: Please specify TV IP (Usage: ./deploy-tizen.sh <TV_IP> --install)"
        exit 1
    fi
    echo "Installing on TV ($TV_IP)..."
    sdb connect "$TV_IP" 2>&1 || true
    sleep 2
    tizen install -s "$TV_IP" --name Lumiere-tizen.wgt -- "$BUILD_DIR" 2>&1 | tail -5
    echo ""
    echo "=== Done! App installed on TV ==="
else
    echo "=== Done! ==="
    echo ""
    echo "To install on TV:"
    echo "  1. Enable Developer Mode on TV: Settings > General > Development > Developer Mode ON"
    echo "  2. Run: ./deploy-tizen.sh <TV_IP> --install"
    echo "  Or manually: tizen install -s <TV_IP> --name Lumiere-tizen.wgt -- $BUILD_DIR"
fi
