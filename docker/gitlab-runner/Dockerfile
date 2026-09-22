# Base nativa do GitLab (https://docs.gitlab.com/runner/install/docker/). O fornecedor
# publica e mantém esta imagem, então não faz sentido remontá-la: só adicionamos o
# nosso entrypoint, que registra o runner lendo o token por arquivo em vez de env var.
FROM gitlab/gitlab-runner:latest

# Ponto de entrega do token: o painel injeta o segredo aqui antes do start, em vez
# de passá-lo por variável de ambiente (que ficaria legível no `docker inspect`).
RUN mkdir -p /run/runnerbox && chmod 700 /run/runnerbox

COPY entrypoint.sh /runnerbox-entrypoint.sh
RUN chmod +x /runnerbox-entrypoint.sh

ENTRYPOINT ["/runnerbox-entrypoint.sh"]
