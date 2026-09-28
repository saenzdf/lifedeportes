#!/bin/bash
# LaunchAgent temporal: auditoría Kapso 8:00 a.m. (semana 31 ago – 6 sep 2026).
# Copia script+env a ~/Library (TCC bloquea Documents/Sync).
set -euo pipefail
ROOT="/Users/diego/Documents/Sync/projects/lifedeportes"
SUPPORT="$HOME/Library/Application Support/lifedeportes"
HEALTH_DIR="$SUPPORT/kapso_health"
LABEL="com.lifedeportes.kapso-response-health-2026-09"
FIRST_DAY="2026-08-31"
LAST_DAY="2026-09-06"
SRC_PLIST="$ROOT/kapso/ops/${LABEL}.plist"
DST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SRC_JS="$ROOT/kapso/scripts/audit_kapso_response_health.js"

mkdir -p "$SUPPORT" "$HEALTH_DIR" "$HOME/Library/LaunchAgents"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not in PATH" >&2
  exit 1
fi

"$NODE_BIN" - <<'NODE'
const fs = require("fs");
const path = require("path");
const os = require("os");
const root = "/Users/diego/Documents/Sync/projects/lifedeportes";
const envPath = path.join(root, ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const support = path.join(os.homedir(), "Library/Application Support/lifedeportes");
const keys = ["KAPSO_API_BASE_URL", "KAPSO_API_KEY"];
const body = keys
  .filter((k) => env[k])
  .map((k) => k + "=" + env[k])
  .concat([""])
  .join("\n");
const envOut = path.join(support, "kapso_response_health.env");
fs.writeFileSync(envOut, body, { mode: 0o600 });
fs.chmodSync(envOut, 0o600);
console.log("wrote", envOut);
NODE

cp "$SRC_JS" "$SUPPORT/audit_kapso_response_health.js"
chmod 700 "$SUPPORT/audit_kapso_response_health.js"

cat > "$SUPPORT/kapso_response_health_audit.sh" <<EOF
#!/bin/bash
set -euo pipefail
LABEL="${LABEL}"
FIRST_DAY="2026-08-31"
LAST_DAY="2026-09-06"
TODAY="\$(date +%Y-%m-%d)"
UID_N="\$(id -u)"

if [[ "\$TODAY" < "\$FIRST_DAY" ]]; then
  echo "\$(date -Iseconds) skip before window (\$TODAY < \$FIRST_DAY)"
  exit 0
fi

if [[ "\$TODAY" > "\$LAST_DAY" ]]; then
  echo "\$(date -Iseconds) window ended — unloading \$LABEL"
  launchctl bootout "gui/\${UID_N}/\${LABEL}" 2>/dev/null || true
  exit 0
fi

SUPPORT="\$HOME/Library/Application Support/lifedeportes"
HEALTH_DIR="\$SUPPORT/kapso_health"
ENVF="\$SUPPORT/kapso_response_health.env"
OUT="\$HEALTH_DIR/\${TODAY}.json"
LOG="\$HEALTH_DIR/\${TODAY}.log"
set -a
# shellcheck disable=SC1090
source "\$ENVF"
set +a
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
NODE_BIN="${NODE_BIN}"

AUDIT_EC=0
{
  echo "=== \$(date -Iseconds) kapso response health (since 24h) ==="
  "\$NODE_BIN" "\$SUPPORT/audit_kapso_response_health.js" --since-hours 24
} | tee "\$LOG" || AUDIT_EC=\$?

# JSON siempre (pipefail cortaba el script antes si el humano salía exit 1)
"\$NODE_BIN" "\$SUPPORT/audit_kapso_response_health.js" --since-hours 24 --json --no-exit-on-findings > "\$OUT"

if [[ "\$TODAY" == "\$LAST_DAY" ]]; then
  echo "\$(date -Iseconds) last scheduled run — unloading \$LABEL"
  launchctl bootout "gui/\${UID_N}/\${LABEL}" 2>/dev/null || true
fi

exit "\$AUDIT_EC"
EOF
chmod 700 "$SUPPORT/kapso_response_health_audit.sh"

cp "$SRC_PLIST" "$DST_PLIST"
UID_N="$(id -u)"
launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_N}" "$DST_PLIST"
launchctl enable "gui/${UID_N}/${LABEL}"
echo "loaded $LABEL — diario 08:00 hora local, $FIRST_DAY … $LAST_DAY"
echo "logs: $HEALTH_DIR/"
launchctl print "gui/${UID_N}/${LABEL}" 2>/dev/null | grep -E "state|runs|calendar" || true
