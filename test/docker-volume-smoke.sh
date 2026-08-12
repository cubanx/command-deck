#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

image="dcc-volume-smoke:$$"
fresh_container="dcc-volume-fresh-$$"
fresh_volume="dcc-volume-fresh-$$"
readonly_volume="dcc-volume-readonly-$$"

cleanup() {
  docker rm -f "$fresh_container" >/dev/null 2>&1 || true
  docker volume rm "$fresh_volume" "$readonly_volume" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker build --tag "$image" .
test "$(docker image inspect --format '{{.Config.User}}' "$image")" = root
docker volume create "$fresh_volume" >/dev/null
docker run --rm \
  --entrypoint sh \
  --mount "type=volume,source=$fresh_volume,target=/data" \
  "$image" -c 'test "$(stat -c %u:%g /data)" = 0:0 && test -z "$(find /data -mindepth 1 -print -quit)"'
docker run --detach \
  --name "$fresh_container" \
  --mount "type=volume,source=$fresh_volume,target=/data" \
  --env NODE_ENV=production \
  --env PORT=3000 \
  --env PUBLIC_URL=https://command-center.up.railway.app \
  --env RAILWAY_PUBLIC_DOMAIN=command-center.up.railway.app \
  --env RAILWAY_VOLUME_MOUNT_PATH=/data \
  --env DATABASE_PATH=/data/command-center.sqlite \
  --env GITHUB_APP_ID=1701 \
  --env GITHUB_CLIENT_ID=client-id \
  --env GITHUB_CLIENT_SECRET=client-secret \
  --env GITHUB_APP_PRIVATE_KEY=private-key \
  --env GITHUB_WEBHOOK_SECRET=webhook-secret \
  "$image" >/dev/null

attempt=0
until docker exec "$fresh_container" bun -e \
  'const response = await fetch("http://127.0.0.1:3000/ready"); process.exit(response.ok ? 0 : 1)' \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker logs "$fresh_container"
    exit 1
  fi
  sleep 1
done

docker exec "$fresh_container" sh -c \
  'grep -Eq "^Uid:[[:space:]]+1000([[:space:]]|$)" /proc/1/status'
docker exec "$fresh_container" sh -c \
  'test "$(stat -c %u:%g /data)" = 1000:1000 && test "$(stat -c %u:%g /data/command-center.sqlite)" = 1000:1000 && test -f /data/command-center.sqlite-wal'

docker volume create "$readonly_volume" >/dev/null
docker run --rm \
  --user 0:0 \
  --entrypoint sh \
  --mount "type=volume,source=$readonly_volume,target=/data" \
  "$image" -c 'printf Quark > /data/sentinel && chown 0:0 /data/sentinel'

if failure_output=$(docker run --rm \
  --mount "type=volume,source=$readonly_volume,target=/data,readonly" \
  --env RAILWAY_VOLUME_MOUNT_PATH=/data \
  --env DATABASE_PATH=/data/command-center.sqlite \
  "$image" 2>&1); then
  echo 'expected read-only volume startup to fail' >&2
  exit 1
fi
test "$failure_output" = 'unable to initialize data volume ownership'

docker run --rm \
  --user 0:0 \
  --entrypoint sh \
  --mount "type=volume,source=$readonly_volume,target=/data" \
  "$image" -c 'test "$(cat /data/sentinel)" = Quark && test "$(stat -c %u:%g /data)" = 0:0 && test "$(stat -c %u:%g /data/sentinel)" = 0:0'
