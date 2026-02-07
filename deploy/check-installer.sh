#!/bin/bash
# Script to check and ensure PDV2Cloud installer is available on VPS

set -e

INSTALLER_DIR="/root/mercadoflow-web/pdv2cloud-agent/installer/Output"
INSTALLER_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe"
CHECKSUM_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe.sha256"
META_FILE="$INSTALLER_DIR/PDV2Cloud-Setup.exe.meta.json"

echo "========================================="
echo "PDV2Cloud Installer Check"
echo "========================================="
echo ""

# Create directory if doesn't exist
if [ ! -d "$INSTALLER_DIR" ]; then
    echo "Creating installer directory: $INSTALLER_DIR"
    mkdir -p "$INSTALLER_DIR"
fi

# Check if installer exists
if [ -f "$INSTALLER_FILE" ]; then
    FILE_SIZE=$(du -h "$INSTALLER_FILE" | cut -f1)
    FILE_DATE=$(stat -c %y "$INSTALLER_FILE" 2>/dev/null || stat -f "%Sm" "$INSTALLER_FILE")

    echo "✅ Installer found:"
    echo "   Path: $INSTALLER_FILE"
    echo "   Size: $FILE_SIZE"
    echo "   Date: $FILE_DATE"

    # Check checksum file
    if [ -f "$CHECKSUM_FILE" ]; then
        CHECKSUM=$(cat "$CHECKSUM_FILE")
        echo "   SHA256: $CHECKSUM"
    else
        echo "⚠️  Checksum file not found, generating..."
        sha256sum "$INSTALLER_FILE" | cut -d' ' -f1 > "$CHECKSUM_FILE"
        echo "   SHA256: $(cat $CHECKSUM_FILE)"
    fi

    # Optional metadata used by the /info and /version endpoints
    if [ -f "$META_FILE" ]; then
        echo "   Meta: $META_FILE"
    else
        echo "   Meta: (nao encontrado - opcional)"
    fi

    echo ""
    echo "✅ Installer is ready for download"
    echo "   API endpoint: https://mercadoflow.com/api/v1/downloads/agent-installer (exige login)"
    echo "   Info endpoint: https://mercadoflow.com/api/v1/downloads/agent-installer/info"
else
    echo "❌ Installer not found at: $INSTALLER_FILE"
    echo ""
    echo "To upload a new installer:"
    echo "1. Build the installer locally:"
    echo "   cd pdv2cloud-agent/scripts"
    echo "   powershell -ExecutionPolicy Bypass -File build-installer.ps1"
    echo ""
    echo "2. Upload to VPS:"
    echo "   scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe root@72.60.10.112:$INSTALLER_DIR/"
    echo "   scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.sha256 root@72.60.10.112:$INSTALLER_DIR/"
    echo "   scp pdv2cloud-agent/installer/Output/PDV2Cloud-Setup.exe.meta.json root@72.60.10.112:$INSTALLER_DIR/"
    echo ""
    exit 1
fi

echo ""
echo "========================================="
echo "Check completed successfully"
echo "========================================="
