FROM ubuntu:22.04

ARG RUNNER_VERSION=2.321.0
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
    && ./bin/installdependencies.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
