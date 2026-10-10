#!/usr/bin/env bash
set -euo pipefail

main() {
if [[ $EUID -ne 0 ]]; then
  echo 'Run this script as root on ldy.' >&2
  exit 1
fi

cd /root/Codes/Soha
exec 9>/run/lock/soha-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

if [[ $(git branch --show-current) != main ]]; then
  echo 'Checkout main before deploying.' >&2
  exit 1
fi
if [[ -n $(git status --porcelain) ]]; then
  echo 'The server checkout has local changes; resolve them before deploying.' >&2
  exit 1
fi

previous_revision=$(git rev-parse HEAD)
git pull --ff-only origin main
revision=$(git rev-parse HEAD)

deployment_failed() {
  echo "Deployment failed. Previous checkout: $previous_revision" >&2
  echo 'See journalctl -u soha -n 100 --no-pager and deploy/README.md for recovery.' >&2
}
trap deployment_failed ERR

# Stop first so npm ci and the build cannot expose partial files to players.
systemctl stop soha
npm ci --include=dev
npm run build -w @soha/core
npm run typecheck
npm run test -w @soha/core -w @soha/server
npm run build

systemd-analyze verify deploy/soha.service
install -m 644 deploy/soha.service /etc/systemd/system/soha.service
systemctl daemon-reload
systemctl restart soha

curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:3001/api/health
printf '\n'
curl --fail --silent --show-error --retry 3 --retry-connrefused --retry-delay 1 --max-time 10 https://soha.catsith.cc/api/health
printf '\n'
systemctl is-active soha
printf 'Deployed %s in /root/Codes/Soha\n' "$revision"
}

# Parse the whole workflow before git pull can update this script on disk.
main "$@"
