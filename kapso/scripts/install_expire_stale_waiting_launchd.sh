#!/bin/bash
# Instala LaunchAgent fuera de Documents (TCC de macOS bloquea Sync/).
set -euo pipefail
ROOT="/Users/diego/Documents/Sync/projects/lifedeportes"
SUPPORT="$HOME/Library/Application Support/lifedeportes"
DST_PLIST="$HOME/Library/LaunchAgents/com.lifedeportes.kapso-expire-stale-waiting.plist"
SRC_PLIST="$ROOT/kapso/ops/com.lifedeportes.kapso-expire-stale-waiting.plist"
LABEL="com.lifedeportes.kapso-expire-stale-waiting"

mkdir -p "$SUPPORT" "$HOME/Library/LaunchAgents"

# Copiar API key a ~/Library (launchd no lee Documents).
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
const reg = JSON.parse(fs.readFileSync(path.join(root, "kapso/service_registry.json"), "utf8"));
const fnId = reg.functions.expire_stale_waiting.kapso_function_id;
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const support = path.join(os.homedir(), "Library/Application Support/lifedeportes");
const body = [
  `KAPSO_API_BASE_URL=${env.KAPSO_API_BASE_URL || "https://api.kapso.ai"}`,
  `KAPSO_API_KEY=${env.KAPSO_API_KEY}`,
  `FUNCTION_ID=${fnId}`,
  "",
].join("\n");
const envOut = path.join(support, "expire-stale-waiting.env");
fs.writeFileSync(envOut, body, { mode: 0o600 });
fs.chmodSync(envOut, 0o600);
const sh = `#!/bin/bash
set -euo pipefail
ENVF="\$HOME/Library/Application Support/lifedeportes/expire-stale-waiting.env"
set -a
# shellcheck disable=SC1090
source "\$ENVF"
set +a
BASE="\${KAPSO_API_BASE_URL%/}"
curl -sS -X POST "\$BASE/platform/v1/functions/\$FUNCTION_ID/invoke" \\
  -H "X-API-Key: \$KAPSO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"dry_run":false,"ttl_hours":3,"max_end":50}'
echo
`;
const shOut = path.join(support, "expire_stale_waiting.sh");
fs.writeFileSync(shOut, sh, { mode: 0o700 });
fs.chmodSync(shOut, 0o700);
console.log("wrote", envOut, shOut);
NODE

cp "$SRC_PLIST" "$DST_PLIST"
UID_N="$(id -u)"
launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_N}" "$DST_PLIST"
launchctl enable "gui/${UID_N}/${LABEL}"
launchctl kickstart -k "gui/${UID_N}/${LABEL}"
echo "loaded $LABEL"
sleep 2
echo "--- stderr ---"
tail -n 20 /tmp/life_expire_stale_waiting.err || true
echo "--- stdout ---"
tail -n 30 /tmp/life_expire_stale_waiting.log || true
