#!/bin/bash
# Diario 06:00 hora local (esperado: Bogotá). Copia a ~/Library (TCC).
set -euo pipefail
ROOT="/Users/diego/Documents/Sync/projects/lifedeportes"
SUPPORT="$HOME/Library/Application Support/lifedeportes"
LABEL="com.lifedeportes.resume-overnight-customer"
SRC_PLIST="$ROOT/kapso/ops/${LABEL}.plist"
DST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SRC_JS="$ROOT/kapso/scripts/resume_overnight_customer.js"

mkdir -p "$SUPPORT" "$HOME/Library/LaunchAgents"

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
const envOut = path.join(support, "resume_overnight_customer.env");
fs.writeFileSync(envOut, body, { mode: 0o600 });
fs.chmodSync(envOut, 0o600);
console.log("wrote", envOut);
NODE

cp "$SRC_JS" "$SUPPORT/resume_overnight_customer.js"
chmod 700 "$SUPPORT/resume_overnight_customer.js"

cat > "$SUPPORT/resume_overnight_customer.sh" <<EOF
#!/bin/bash
set -euo pipefail
SUPPORT="\$HOME/Library/Application Support/lifedeportes"
ENVF="\$SUPPORT/resume_overnight_customer.env"
set -a
# shellcheck disable=SC1090
source "\$ENVF"
set +a
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
NODE_BIN="${NODE_BIN}"
"\$NODE_BIN" "\$SUPPORT/resume_overnight_customer.js"
EOF
chmod 700 "$SUPPORT/resume_overnight_customer.sh"

cp "$SRC_PLIST" "$DST_PLIST"
UID_N="$(id -u)"
launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_N}" "$DST_PLIST"
launchctl enable "gui/${UID_N}/${LABEL}"
echo "loaded $LABEL — diario 06:00 hora local (no RunAtLoad)"
launchctl print "gui/${UID_N}/${LABEL}" 2>/dev/null | grep -E "state|runs|interval|calendar" || true
