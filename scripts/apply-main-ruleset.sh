#!/usr/bin/env bash
set -euo pipefail

ruleset_name="main-quality-gate"
ruleset_file=".github/rulesets/main.json"
repository="${GH_REPO:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"

if [[ ! -f "${ruleset_file}" ]]; then
  echo "Ruleset定義が見つかりません: ${ruleset_file}" >&2
  exit 1
fi

existing_id="$(gh api --paginate "repos/${repository}/rulesets" --jq ".[] | select(.name == \"${ruleset_name}\") | .id" | head -n 1)"

if [[ -n "${existing_id}" ]]; then
  gh api --method PUT "repos/${repository}/rulesets/${existing_id}" --input "${ruleset_file}" >/dev/null
  echo "${repository} のRulesetを更新しました: ${ruleset_name}"
else
  gh api --method POST "repos/${repository}/rulesets" --input "${ruleset_file}" >/dev/null
  echo "${repository} にRulesetを作成しました: ${ruleset_name}"
fi

gh api --method PATCH "repos/${repository}" -F allow_auto_merge=true -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null
echo "必須検査と会話解決を満たしたPRだけ、自動マージを予約できます。"
