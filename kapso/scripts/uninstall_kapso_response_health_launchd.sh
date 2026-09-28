#!/bin/bash
# Quita el LaunchAgent temporal de auditoría Kapso.
set -euo pipefail
LABEL="com.lifedeportes.kapso-response-health-2026-09"
DST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_N="$(id -u)"
launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
rm -f "$DST_PLIST"
echo "unloaded $LABEL"
