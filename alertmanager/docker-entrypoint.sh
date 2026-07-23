#!/bin/sh
# Renders alertmanager.yml.tmpl and starts Alertmanager. envsubst is absent from the
# busybox-based prom/alertmanager image, so:
#   1. sed strips the optional #IF_.../#ENDIF_... blocks whose URL is not configured
#      (Alertmanager rejects an empty webhook url);
#   2. the shell expands the ${VAR} placeholders via an unquoted here-doc. The template
#      contains no backticks or $( ) by construction, so only intended vars are expanded.
set -e

: "${ALERTMANAGER_SMTP_PORT:=587}"

# Optional channels: an empty URL disables the channel.
if [ -n "${ALERTMANAGER_WEBHOOK_URL:-}" ]; then WEBHOOK_ON=1; else WEBHOOK_ON=0; fi
if [ -n "${WATCHDOG_HEARTBEAT_URL:-}" ]; then
  WATCHDOG_ON=1
  WATCHDOG_RECEIVER=watchdog-heartbeat
else
  WATCHDOG_ON=0
  WATCHDOG_RECEIVER=null   # blackhole: watchdog fires constantly, must not email
fi
export WATCHDOG_RECEIVER

TMPL=/etc/alertmanager/alertmanager.yml.tmpl
WORK=/alertmanager/alertmanager.work.yml       # data volume: guaranteed writable
OUT=/alertmanager/alertmanager.rendered.yml

cp "$TMPL" "$WORK"

# Keep or drop the optional blocks (delete just the markers vs. the whole block).
if [ "$WEBHOOK_ON" = 1 ]; then
  sed -i '/#IF_WEBHOOK/d; /#ENDIF_WEBHOOK/d' "$WORK"
else
  sed -i '/#IF_WEBHOOK/,/#ENDIF_WEBHOOK/d' "$WORK"
fi
if [ "$WATCHDOG_ON" = 1 ]; then
  sed -i '/#IF_WATCHDOG/d; /#ENDIF_WATCHDOG/d' "$WORK"
else
  sed -i '/#IF_WATCHDOG/,/#ENDIF_WATCHDOG/d' "$WORK"
fi

eval "cat <<AM_EOF >\"$OUT\"
$(cat "$WORK")
AM_EOF"

exec /bin/alertmanager \
  --config.file="$OUT" \
  --storage.path=/alertmanager \
  --cluster.listen-address=
