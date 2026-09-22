#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_URL:?RUNNER_URL é obrigatório}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN é obrigatório}"

RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-/tmp/runner/work}"

cd /actions-runner

# --replace evita que uma recriação (estratégia de update do painel) colida com o
# registro antigo de mesmo nome que ainda esteja listado no GitHub.
./config.sh \
    --unattended \
    --replace \
    --url "${RUNNER_URL}" \
    --token "${RUNNER_TOKEN}" \
    --name "${RUNNER_NAME}" \
    --work "${RUNNER_WORKDIR}" \
    ${RUNNER_LABELS:+--labels "${RUNNER_LABELS}"}

# Remove o registro ao receber SIGTERM, para não deixar runner fantasma no GitHub
# quando o painel executa `docker stop`.
deregister() {
    ./config.sh remove --token "${RUNNER_TOKEN}" || true
    exit 0
}
trap deregister SIGTERM SIGINT

./run.sh &
wait $!
