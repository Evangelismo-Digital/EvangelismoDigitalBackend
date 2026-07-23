#!/bin/sh
# Renders alertmanager.yml.tmpl (expanding ${VAR} from the environment) and starts
# Alertmanager. envsubst is absent from the busybox-based prom/alertmanager image, so
# the shell does the expansion via an unquoted here-doc. The template contains no
# backticks or $( ) by construction, so only the intended variables are substituted.
set -e

: "${ALERTMANAGER_SMTP_PORT:=587}"

TMPL=/etc/alertmanager/alertmanager.yml.tmpl
OUT=/alertmanager/alertmanager.rendered.yml   # data volume: guaranteed writable

eval "cat <<AM_EOF >\"$OUT\"
$(cat "$TMPL")
AM_EOF"

exec /bin/alertmanager \
  --config.file="$OUT" \
  --storage.path=/alertmanager \
  --cluster.listen-address=
