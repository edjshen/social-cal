#!/usr/bin/env bash
# Garbage-collect orphaned per-PR preview Workers for barycal.
#
# preview.yml deploys an isolated `barycal-pr-<N>` Worker per open PR;
# preview-cleanup.yml deletes it when the PR closes. That cleanup is
# event-driven: if a PR-close run is skipped (e.g. CLOUDFLARE_API_TOKEN unset) or
# fails, the preview Worker is orphaned. This sweep is the daily backstop — it
# deletes any `barycal-pr-<N>` whose PR is no longer open. It's invoked from
# GitHub Actions (GitHub's scheduler), so it consumes NO Cloudflare cron trigger.
#
# Safety invariants:
#   * Anchored match `^barycal-pr-[0-9]+$` — NEVER the prod `barycal` Worker, the
#     `barycal-room` relay, or another project's previews (e.g. `plur-nyc-pr-*`).
#   * Deletes only previews whose PR number is NOT in the open set. A failure to
#     fetch that open set aborts the run (set -e + pipefail) rather than mass-deleting.
#   * 404 on delete = already gone = success.
#   * DRY_RUN=true logs decisions and deletes nothing.
#
# Env:
#   CF_API_TOKEN, CF_ACCOUNT_ID   required (unless SCRIPTS_JSON_OVERRIDE is set, for tests)
#   DRY_RUN                       "true" => no deletions (default "false")
#   OPEN_PRS                      space-separated PR numbers to KEEP; if unset, derived via `gh pr list`
#   SCRIPTS_JSON_OVERRIDE         path to a Cloudflare list-scripts JSON response (test hook; bypasses the live API)
set -euo pipefail

PREFIX="barycal-pr-"
PATTERN='^barycal-pr-[0-9]+$'
DRY_RUN="${DRY_RUN:-false}"

log() { printf '%s\n' "$*"; }

# --- 1. Gather candidate preview Workers -------------------------------------
if [ -n "${SCRIPTS_JSON_OVERRIDE:-}" ]; then
  scripts_json="$(cat "$SCRIPTS_JSON_OVERRIDE")"
else
  if [ -z "${CF_API_TOKEN:-}" ] || [ -z "${CF_ACCOUNT_ID:-}" ]; then
    log "::warning::CLOUDFLARE_API_TOKEN / CF_ACCOUNT_ID not set — skipping preview GC."
    exit 0
  fi
  scripts_json="$(curl -sS --max-time 30 \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts?per_page=100" \
    -H "Authorization: Bearer ${CF_API_TOKEN}")"
  if [ "$(printf '%s' "$scripts_json" | jq -r '.success')" != "true" ]; then
    log "::error::Failed to list Workers scripts:"
    printf '%s' "$scripts_json" | jq -r '.errors' || true
    exit 1
  fi
fi

previews=()
while IFS= read -r _line; do
  [ -n "$_line" ] && previews+=("$_line")
done < <(printf '%s' "$scripts_json" | jq -r --arg re "$PATTERN" '.result[].id | select(test($re))' | sort)

if [ "${#previews[@]}" -eq 0 ]; then
  log "No ${PREFIX}* preview Workers on the account. Nothing to sweep."
  exit 0
fi
log "Found ${#previews[@]} preview Worker(s): ${previews[*]}"

# --- 2. Determine which PRs are still open (the KEEP set) ---------------------
# pipefail ensures a `gh` failure aborts here instead of leaving OPEN_PRS empty (which would sweep all).
if [ -z "${OPEN_PRS:-}" ]; then
  OPEN_PRS="$(gh pr list --state open --limit 1000 --json number -q '.[].number' | tr '\n' ' ')"
fi
log "Open PRs (kept): ${OPEN_PRS:-(none)}"

# --- 3. Sweep closed-PR previews ---------------------------------------------
deleted=0; kept=0; failed=0
for name in "${previews[@]}"; do
  num="${name#"$PREFIX"}" # strip the prefix → bare PR number
  if printf ' %s ' "$OPEN_PRS" | grep -q " ${num} "; then
    log "KEEP  ${name} (PR #${num} open)"
    kept=$((kept + 1))
    continue
  fi
  if [ "$DRY_RUN" = "true" ]; then
    log "WOULD DELETE ${name} (PR #${num} closed/absent)"
    deleted=$((deleted + 1))
    continue
  fi
  log "DELETE ${name} (PR #${num} closed/absent) …"
  # ?force=true removes the script even if it still has routes/schedules bound.
  code="$(curl -sS -o /tmp/preview-gc-del.json -w '%{http_code}' --max-time 30 -X DELETE \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${name}?force=true" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" || echo 000)"
  if [ "$code" = "200" ] || [ "$code" = "404" ]; then
    log "  ok (${code})"
    deleted=$((deleted + 1))
  else
    log "::warning::  failed to delete ${name} (HTTP ${code}): $(cat /tmp/preview-gc-del.json 2>/dev/null || true)"
    failed=$((failed + 1))
  fi
done

log "Sweep complete — deleted=${deleted} kept=${kept} failed=${failed}"
[ "$failed" -eq 0 ]
