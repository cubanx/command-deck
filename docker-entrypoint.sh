#!/bin/sh
set -eu

fail() {
  echo "$1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail 'root volume initialization required'

if [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != /data ] || \
  [ "${DATABASE_PATH:-}" != /data/command-center.sqlite ] || \
  [ ! -d /data ] || [ -L /data ]; then
  fail 'invalid data volume configuration'
fi

if [ "$(id -u bun 2>/dev/null)" != 1000 ] || [ "$(id -g bun 2>/dev/null)" != 1000 ]; then
  fail 'invalid application user identity'
fi

owner=$(stat -c '%u:%g' /data 2>/dev/null) || fail 'unable to inspect data volume ownership'
if [ "$owner" != 1000:1000 ] && ! chown 1000:1000 /data 2>/dev/null; then
  fail 'unable to initialize data volume ownership'
fi

exec setpriv --reuid=bun --regid=bun --init-groups -- "$@" || fail 'unable to drop startup privileges'
