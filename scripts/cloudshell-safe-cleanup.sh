#!/usr/bin/env bash
# Safe Dayframe-only Cloud Shell cleanup. Run AFTER all other jobs finish.
# Read-only by default. Never touches project repos, lockfiles or cloud data.
set -Eeuo pipefail
mode=plan
npm_cache=false
for option in "$@"; do
 case "$option" in
  --plan) mode=plan ;;
  --apply) mode=apply ;;
  --npm-cache) npm_cache=true ;;
  --help|-h) echo 'Usage: bash scripts/cloudshell-safe-cleanup.sh --plan | --apply [--npm-cache]'; exit 0 ;;
  *) echo "Unknown option: $option" >&2; exit 2 ;;
 esac
done
if [[ "$mode" != apply && "$npm_cache" == true ]]; then
 echo '--npm-cache requires --apply' >&2; exit 2
fi
if [[ -z "$HOME" ]]; then echo 'HOME is unset' >&2; exit 2; fi
home=$(cd -- "$HOME" && pwd -P)
if [[ "$home" == / || "$home" == /home ]]; then echo 'Unsafe home path' >&2; exit 2; fi
if [[ "$npm_cache" == true && ( -L "$home/.npm" || -L "$home/.npm/_cacache" ) ]]; then
 echo 'Refusing to clean symlinked npm cache' >&2; exit 2
fi

# Dayframe H2 creates home/dayframe-security-trial.XXXXXXXX with git archive.
# Only delete a real directory matching that name AND verified Dayframe files.
valid_trial() {
 local path=$1 basename
 basename=$(basename -- "$path")
 [[ "$path" == "$home"/* ]] || return 1
 [[ "$basename" =~ ^dayframe-security-trial\.[A-Za-z0-9]{8}$ ]] || return 1
 [[ -d "$path" && ! -L "$path" && ! -e "$path/.git" ]] || return 1
 [[ -f "$path/package.json" && -f "$path/scripts/h2-security-trial.sh" ]] || return 1
 grep -Eq '"name"[[:space:]]*:[[:space:]]*"dayframe-web"' "$path/package.json"
}

# Mutations must not race with another developer command.
active_jobs() {
 local jobs
 jobs=$(ps -u "$(id -un)" -o pid=,comm=,args= 2>/dev/null) || {
  echo 'Cannot check active processes; refusing cleanup' >&2; return 2;
 }
 awk -v self="$$" -v parent="$PPID" '
  {if ($1==self || $1==parent)next;
   if ($2 ~ /^(node|npm|npx|pnpm|yarn|git|gcloud|docker|pip|pip3|psql|pg_dump|pg_restore)$/ ||
       $2 ~ /^python[0-9.]*$/) print $0;}' <<< "$jobs"
}

printf 'Dayframe cleanup mode: %s; home: %s\n' "$mode" "$home"
df -h "$home" || true
shopt -s nullglob
found=0
for trial in "$home"/dayframe-security-trial.*; do
 if valid_trial "$trial"; then
  found=$((found+1))
  printf 'SAFE disposable trial: '; du -sh -- "$trial" || true
 else
  printf 'SKIP unverified location: %s\n' "$trial"
 fi
done
printf 'Verified disposable trials: %s\n' "$found"
if [[ -d "$home/.npm/_cacache" ]]; then
 printf 'Regenerable npm download cache: '; du -sh -- "$home/.npm/_cacache" || true
fi
if [[ "$mode" == plan ]]; then
 echo 'Read-only audit complete; no deletion occurred.'
 echo 'After all other work ends: --apply [--npm-cache] (interactive confirmation required)'
 exit 0
fi
if [[ ! -t 0 ]]; then echo 'Refusing noninteractive deletion' >&2; exit 3; fi
jobs=$(active_jobs) || exit 3
if [[ -n "$jobs" ]]; then
 printf 'Other development processes may be active; refusing deletion:\n%s\n' "$jobs" >&2
 exit 3
fi
printf 'Delete ONLY %s verified Dayframe trial folder(s)' "$found"
if [[ "$npm_cache" == true ]]; then printf ' and clear npm download cache'; fi
printf '? Type EXACTLY DAYFRAME CLEANUP AFTER RUNS: '
IFS= read -r answer
if [[ "$answer" != 'DAYFRAME CLEANUP AFTER RUNS' ]]; then
 echo 'Cancelled, nothing deleted.'; exit 3
fi
jobs=$(active_jobs) || exit 3
if [[ -n "$jobs" ]]; then echo 'New development process detected; refusing deletion' >&2; exit 3; fi
for trial in "$home"/dayframe-security-trial.*; do
 if valid_trial "$trial"; then
  printf 'Deleting verified temporary trial: %s\n' "$trial"
  rm -rf -- "$trial"
 else
  printf 'SKIP unverified location: %s\n' "$trial"
 fi
done
if [[ "$npm_cache" == true ]]; then
 if ! command -v npm >/dev/null 2>&1; then
  echo 'npm unavailable; npm cache was not deleted.' >&2; exit 5
 fi
 echo 'Clearing regenerable npm cache only (not npm config or credentials).'
 npm cache clean --force --cache "$home/.npm"
fi
printf 'Cleanup finished. Remaining storage:\n'
df -h "$home" || true
