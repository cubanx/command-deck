#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  if [ "${RAILWAY_RUN_UID:-}" != 0 ] || [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != /data ] || [ ! -d /data ]; then
    echo 'refusing unconfigured root startup' >&2
    exit 1
  fi

  incompatible=$(find /data -mindepth 1 \( ! -user bun -o ! -group bun \) -print -quit)
  if [ -n "$incompatible" ]; then
    echo 'refusing to change ownership of existing volume content' >&2
    exit 1
  fi

  chown bun:bun /data
  exec setpriv --reuid=bun --regid=bun --init-groups -- "$@"
fi

exec "$@"
