#!/usr/bin/env bash
set -euo pipefail

: "${CI_SERVER_URL:?CI_SERVER_URL é obrigatório}"

TOKEN_FILE="${RUNNERBOX_TOKEN_FILE:-/run/runnerbox/token}"
CONFIG_FILE="${CONFIG_FILE:-/etc/gitlab-runner/config.toml}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_EXECUTOR="${RUNNER_EXECUTOR:-docker}"
DOCKER_IMAGE="${DOCKER_IMAGE:-alpine:latest}"
REGISTERED_HERE=0

# Após o registro o token já está gravado no config.toml; num restart não há o que
# registrar, e é isso que permite destruir o arquivo de token com segurança.
if ! grep -q '\[\[runners\]\]' "${CONFIG_FILE}" 2>/dev/null; then
    if [[ ! -s "${TOKEN_FILE}" ]]; then
        echo "runnerbox: token não encontrado em ${TOKEN_FILE}" >&2
        exit 1
    fi

    # O token vive apenas como variável do shell: não é exportado, então não aparece
    # em /proc/<pid>/environ nem no `docker inspect`.
    REGISTRATION_TOKEN="$(cat "${TOKEN_FILE}")"

    # O GitLab 16 substituiu os registration tokens por authentication tokens (glrt-),
    # que são passados em uma flag diferente.
    if [[ "${REGISTRATION_TOKEN}" == glrt-* ]]; then
        TOKEN_FLAG="--token"
    else
        TOKEN_FLAG="--registration-token"
    fi

    gitlab-runner register --non-interactive \
        --config "${CONFIG_FILE}" \
        --url "${CI_SERVER_URL}" \
        "${TOKEN_FLAG}" "${REGISTRATION_TOKEN}" \
        --name "${RUNNER_NAME}" \
        --executor "${RUNNER_EXECUTOR}" \
        --docker-image "${DOCKER_IMAGE}" \
        --docker-volumes /var/run/docker.sock:/var/run/docker.sock

    # Só destrói o token depois do registro dar certo.
    shred -u "${TOKEN_FILE}" 2>/dev/null || rm -f "${TOKEN_FILE}"
    REGISTERED_HERE=1
fi

deregister() {
    [[ "${REGISTERED_HERE}" -eq 1 ]] && gitlab-runner unregister --all-runners || true
    exit 0
}
trap deregister SIGTERM SIGINT

# Sem `exec`: o processo precisa continuar sendo o shell para que o trap acima
# rode no SIGTERM e desregistre o runner no GitLab.
gitlab-runner run --user=gitlab-runner --working-directory=/home/gitlab-runner &
wait $!
