#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/diego/Documents/Sync/projects/lifedeportes/skills-public/desarrollo-acciones-automatizadas-odoo"
LIFE_DIR="/Users/diego/Documents/Sync/projects/lifedeportes"

echo "=== GitHub user ==="
GH_USER=$(gh api user --jq '.login' 2>&1) || true
echo "USER=$GH_USER"

echo "=== Public repo init ==="
cd "$REPO_DIR"
if [[ ! -d .git ]]; then
  git init
  git checkout -b main
fi
git add README.md SKILL.md reference.md LICENSE
git status

if ! git diff --cached --quiet; then
  git commit -m "$(cat <<'EOF'
Publicar skill de acciones automatizadas Odoo 19 Studio.

Incluye preguntas obligatorias (modelo, trigger), safe_eval y plantillas Execute Code.
EOF
)"
fi

REPO_NAME="desarrollo-acciones-automatizadas-odoo"
if gh repo view "$GH_USER/$REPO_NAME" &>/dev/null; then
  echo "Repo exists, pushing..."
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"
  git push -u origin main
else
  echo "Creating public repo..."
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    --description "Agent skill: desarrollo de acciones automatizadas en Odoo 19 Studio (Execute Code, triggers, safe_eval)"
fi

echo "=== Life deportes commit ==="
cd "$LIFE_DIR"
git status -sb 2>&1 || echo "No git repo in lifedeportes"

if git rev-parse --git-dir &>/dev/null; then
  git add \
    .cursor/skills/odoo-studio-automations/ \
    .cursor/mcp.json \
    scripts/run-odoo-mcp-prod.sh \
    .env.example \
  docs/odoo/ \
    skills-public/ \
    2>/dev/null || true
  git add -A .cursor/skills/ docs/odoo/ skills-public/ scripts/run-odoo-mcp-prod.sh .env.example .cursor/mcp.json 2>/dev/null || true
  git status -sb
  if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "$(cat <<'EOF'
Add Odoo Studio automations skill, prod MCP, and CDR cleanup docs.

- Agent skill for Studio automated actions (model/trigger/safe_eval)
- Public skill mirror in skills-public/
- odoo-prod MCP launcher and .env prod variables
EOF
)" || true
  fi
fi

echo "=== DONE ==="
gh repo view "$GH_USER/$REPO_NAME" --json url -q .url 2>&1 || true
