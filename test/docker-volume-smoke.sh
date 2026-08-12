#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

image="dcc-volume-smoke:$$"
fresh_container="dcc-volume-fresh-$$"
fresh_volume="dcc-volume-fresh-$$"
incompatible_container="dcc-volume-incompatible-$$"
incompatible_volume="dcc-volume-incompatible-$$"

cleanup() {
  docker rm -f "$fresh_container" "$incompatible_container" >/dev/null 2>&1 || true
  docker volume rm "$fresh_volume" "$incompatible_volume" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker build --tag "$image" .
test "$(docker image inspect --format '{{.Config.User}}' "$image")" = bun
docker volume create "$fresh_volume" >/dev/null
docker run --detach \
  --name "$fresh_container" \
  --user 0:0 \
  --mount "type=volume,source=$fresh_volume,target=/data" \
  --env NODE_ENV=production \
  --env PORT=3000 \
  --env PUBLIC_URL=https://command-center.up.railway.app \
  --env RAILWAY_PUBLIC_DOMAIN=command-center.up.railway.app \
  --env RAILWAY_VOLUME_MOUNT_PATH=/data \
  --env RAILWAY_RUN_UID=0 \
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

docker volume create "$incompatible_volume" >/dev/null
docker run --rm \
  --user 0:0 \
  --entrypoint sh \
  --mount "type=volume,source=$incompatible_volume,target=/data" \
  "$image" -c 'printf Quark > /data/sentinel && chown 0:0 /data/sentinel'

if docker run \
  --name "$incompatible_container" \
  --user 0:0 \
  --mount "type=volume,source=$incompatible_volume,target=/data" \
  --env RAILWAY_VOLUME_MOUNT_PATH=/data \
  --env RAILWAY_RUN_UID=0 \
  "$image"; then
  echo 'expected incompatible volume startup to fail' >&2
  exit 1
fi

docker run --rm \
  --user 0:0 \
  --entrypoint sh \
  --mount "type=volume,source=$incompatible_volume,target=/data" \
  "$image" -c 'test "$(cat /data/sentinel)" = Quark && test "$(stat -c %u:%g /data/sentinel)" = 0:0'
