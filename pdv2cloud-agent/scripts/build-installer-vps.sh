#!/bin/bash
# Build script for PDV2Cloud Desktop Agent Installer on VPS
# This script packages the agent installer without requiring Windows/Inno Setup
# The actual .exe will be pre-built and uploaded manually, this ensures it's available

set -e

echo "=========================================="
echo "PDV2Cloud Installer Build Script (VPS)"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALLER_DIR="$AGENT_ROOT/installer/Output"
INSTALLER_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe"
CHECKSUM_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe.sha256"
META_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe.meta.json"

# Create installer directory if it doesn't exist
mkdir -p "$INSTALLER_DIR"

echo "[1/3] Checking for existing installer..."
if [ -f "$INSTALLER_FILE" ]; then
    FILE_SIZE=$(du -h "$INSTALLER_FILE" | cut -f1)
    FILE_DATE=$(stat -c %y "$INSTALLER_FILE" 2>/dev/null || stat -f "%Sm" "$INSTALLER_FILE" 2>/dev/null || echo "unknown")

    echo "  ✓ Installer found: $INSTALLER_FILE"
    echo "  ✓ Size: $FILE_SIZE"
    echo "  ✓ Date: $FILE_DATE"
else
    echo "  ℹ No installer found - will be available after first manual upload"
    echo ""
    echo "To upload the installer:"
    echo "  1. Build locally on Windows with build-installer.ps1"
    echo "  2. Upload to VPS:"
    echo "     scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe root@72.60.10.112:$INSTALLER_DIR/"
    echo ""
fi

echo ""
echo "[2/3] Generating/verifying SHA256 checksum..."
if [ -f "$INSTALLER_FILE" ]; then
    # Generate fresh checksum
    if command -v sha256sum &> /dev/null; then
        sha256sum "$INSTALLER_FILE" | cut -d' ' -f1 > "$CHECKSUM_FILE"
        CHECKSUM=$(cat "$CHECKSUM_FILE")
        echo "  ✓ SHA256: $CHECKSUM"
    else
        echo "  ⚠ sha256sum not available, skipping checksum"
    fi
else
    echo "  ⚠ Skipping (no installer file)"
fi

echo ""
echo "[3/3] Verifying installer is accessible..."
if [ -f "$INSTALLER_FILE" ] && [ -r "$INSTALLER_FILE" ]; then
    echo "  ✓ Installer is readable and ready for download"
    if [ -f "$META_FILE" ]; then
        echo "  ✓ Metadata found: $META_FILE"
    else
        echo "  ℹ Metadata not found (optional): $META_FILE"
    fi
    echo ""
    echo "=========================================="
    echo "Build completed successfully!"
    echo "Installer available at:"
    echo "  - API: https://mercadoflow.com/api/v1/downloads/agent-installer (exige login)"
    echo "  - Web: https://mercadoflow.com/download-agente"
    echo "=========================================="
    exit 0
else
    echo "  ℹ Installer not yet available"
    echo ""
    echo "=========================================="
    echo "Setup completed (installer pending upload)"
    echo "=========================================="
    exit 0
fi
