#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_URL:?RUNNER_URL é obrigatório}"

TOKEN_FILE="${RUNNERBOX_TOKEN_FILE:-/run/runnerbox/token}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-/tmp/runner/work}"
RUNNER_TOKEN=""

cd /actions-runner

# O registro consome o token e grava as credenciais em .runner/.credentials. Num
# restart do container elas já existem, então não há o que registrar de novo — e é
# isso que permite destruir o token sem condenar o container a um loop de falhas.
if [[ ! -f .runner ]]; then
    if [[ ! -s "${TOKEN_FILE}" ]]; then
        echo "runnerbox: token não encontrado em ${TOKEN_FILE}" >&2
        exit 1
    fi

    # O token vive apenas como variável do shell: não é exportado, então não aparece
    # em /proc/<pid>/environ nem no `docker inspect`.
    RUNNER_TOKEN="$(cat "${TOKEN_FILE}")"

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

    # Só destrói o token depois do registro dar certo: se falhar, o container reinicia
    # e tenta de novo em vez de ficar travado sem credencial.
    shred -u "${TOKEN_FILE}" 2>/dev/null || rm -f "${TOKEN_FILE}"
fi

# Remove o registro ao receber SIGTERM, para não deixar runner fantasma no GitHub.
# Só é possível enquanto o token estiver em memória, ou seja, no ciclo em que o
# runner foi registrado; após um restart o painel remove o container do mesmo jeito.
deregister() {
    [[ -n "${RUNNER_TOKEN}" ]] && ./config.sh remove --token "${RUNNER_TOKEN}" || true
    exit 0
}
trap deregister SIGTERM SIGINT

./run.sh &
wait $!
