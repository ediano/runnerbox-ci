FROM ubuntu:22.04

ARG RUNNER_VERSION=2.337.0
ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_ALLOW_RUNASROOT=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq sudo tar unzip libicu70 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /actions-runner
RUN curl -fsSL -o runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && test -x ./config.sh \
    && ./bin/installdependencies.sh

# Ponto de entrega do token: o painel injeta o segredo aqui antes do start, em vez
# de passá-lo por variável de ambiente (que ficaria legível no `docker inspect`).
RUN mkdir -p /run/runnerbox && chmod 700 /run/runnerbox

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
