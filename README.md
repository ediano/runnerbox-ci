# RunnerBox CI

Painel local, em container Docker, para gerenciar o ciclo de vida (CRUD) de
*self-hosted runners* do **GitHub Actions** e executores do **GitLab CI**.

Sem autenticação e sem banco de dados: o estado dos runners é lido direto da API do
Docker, e cada runner sobe como um container filho `runnerbox-worker-*` identificado
pela label `ci.runnerbox.managed=true`.

Especificação completa em [`docs/spec-mvp.md`](docs/spec-mvp.md).

## Rodando em desenvolvimento

```bash
npm install
npm run dev     # http://localhost:2131
```

As portas 3000/8080 estão reservadas no ambiente de desenvolvimento alvo; o projeto
usa **2131** (dev) e **2141** (produção).

## Rodando a ferramenta empacotada

```bash
docker compose up -d   # http://localhost:2141
```

Ajuste `SEU_USUARIO` no [`docker-compose.yml`](docker-compose.yml). O mapeamento de
`/var/run/docker.sock` é obrigatório — é por ele que o painel cria e remove os runners.

## Variáveis de ambiente

| Variável | Default | Para quê |
| --- | --- | --- |
| `RUNNERBOX_GITHUB_IMAGE` | `myoung34/docker-github-actions-runner:latest` | Imagem dos runners do GitHub |
| `RUNNERBOX_GITLAB_IMAGE` | `gitlab/gitlab-runner:latest` | Imagem dos runners do GitLab |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Socket do daemon Docker |

Por padrão o painel usa imagens públicas, para funcionar já no primeiro uso. Se preferir
as imagens base próprias deste repositório:

```bash
docker build -t runnerbox/github-runner:latest docker/github-runner
docker build -t runnerbox/gitlab-runner:latest docker/gitlab-runner
```

e aponte `RUNNERBOX_GITHUB_IMAGE` / `RUNNERBOX_GITLAB_IMAGE` para elas.

## Tokens

- **GitHub:** *Settings → Actions → Runners → New self-hosted runner*. Uma URL
  `https://github.com/owner/repo` registra no repositório; `https://github.com/owner`
  registra na organização.
- **GitLab:** aceita tanto *registration token* quanto *authentication token* (`glrt-…`,
  padrão a partir do GitLab 16).

O token **não** é armazenado: ele vira variável de ambiente do container filho e nunca é
gravado em label, justamente porque labels são legíveis em `docker inspect`. Por isso,
editar um runner exige informá-lo novamente.

## Atualizar e excluir

A atualização usa a estratégia **recreate**: as credenciais de registro são variáveis de
ambiente do container, então o painel remove o container antigo (`docker rm -f`) e sobe um
novo com os valores atualizados. A exclusão faz `stop` seguido de `remove`.

## Publicação no Docker Hub (autobuild)

A imagem é construída pelo próprio Docker Hub a cada push, sem GitHub Actions. Em
**Repository → Builds → Configure Automated Builds**, conecte este repositório e crie
duas build rules:

| Source type | Source | Docker Tag | Dockerfile location | Build context |
| --- | --- | --- | --- | --- |
| Branch | `main` | `latest` | `/Dockerfile` | `/` |
| Tag | `/^v([0-9.]+)$/` | `{\1}` | `/Dockerfile` | `/` |

- Todo push na `main` reconstrói `:latest` — é a tag que o `docker-compose.yml` consome.
- Uma git tag `v1.2.3` gera adicionalmente a tag imutável `1.2.3` (o `{\1}` referencia o
  grupo de captura do regex), para quem não quer acompanhar a `main`.

> O autobuild do Docker Hub exige plano pago (Pro/Team/Business). Em conta gratuita, o
> caminho é publicar manualmente:
>
> ```bash
> docker build -t SEU_USUARIO/runnerbox-ci:latest .
> docker push SEU_USUARIO/runnerbox-ci:latest
> ```

## Testes

```bash
npm test     # Vitest sobre a lógica pura de lib/runner-spec.js
npm run lint
```

## Ambiente de desenvolvimento

O [`.devcontainer/`](.devcontainer/devcontainer.json) traz Docker-in-Docker, para que
`docker build` e `docker run` da imagem final não interfiram nos containers do host.
A imagem base é fixada em *bookworm*: a tag genérica `:20` aponta para Debian *trixie*,
onde a feature `docker-in-docker` falha (o pacote `moby-cli` não existe nessa distro).
