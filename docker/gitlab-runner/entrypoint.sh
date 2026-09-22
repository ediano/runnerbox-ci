#!/usr/bin/env bash
set -euo pipefail

: "${CI_SERVER_URL:?CI_SERVER_URL é obrigatório}"
: "${REGISTRATION_TOKEN:?REGISTRATION_TOKEN é obrigatório}"

RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_EXECUTOR="${RUNNER_EXECUTOR:-docker}"
DOCKER_IMAGE="${DOCKER_IMAGE:-alpine:latest}"

# O GitLab 16 substituiu os registration tokens por authentication tokens (glrt-),
# que são passados em uma flag diferente.
if [[ "${REGISTRATION_TOKEN}" == glrt-* ]]; then
    TOKEN_FLAG="--token"
else
    TOKEN_FLAG="--registration-token"
fi

gitlab-runner register --non-interactive \
    --url "${CI_SERVER_URL}" \
    "${TOKEN_FLAG}" "${REGISTRATION_TOKEN}" \
    --name "${RUNNER_NAME}" \
    --executor "${RUNNER_EXECUTOR}" \
    --docker-image "${DOCKER_IMAGE}" \
    --docker-volumes /var/run/docker.sock:/var/run/docker.sock

deregister() {
    gitlab-runner unregister --all-runners || true
    exit 0
}
trap deregister SIGTERM SIGINT

# Sem `exec`: o processo precisa continuar sendo o shell para que o trap acima
# rode no SIGTERM e desregistre o runner no GitLab.
gitlab-runner run --user=gitlab-runner --working-directory=/home/gitlab-runner &
wait $!
