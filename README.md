# RunnerBox CI

[Repositório](https://github.com/ediano/runnerbox-ci) · [Imagem no Docker Hub](https://hub.docker.com/r/ediano/runnerbox-ci) · Autor: [@ediano](https://github.com/ediano)

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

A imagem publicada é [`ediano/runnerbox-ci`](https://hub.docker.com/r/ediano/runnerbox-ci).
O mapeamento de `/var/run/docker.sock` é obrigatório — é por ele que o painel cria e
remove os runners.

## Os motores dos runners

O painel não depende de nenhuma imagem de terceiros em registry: os motores são
construídos **sob demanda**, a partir dos contextos versionados em [`docker/`](docker/),
na primeira vez que você cria um runner daquela plataforma.

| Plataforma | Base | Por quê |
| --- | --- | --- |
| GitHub | `ubuntu:22.04` + tarball oficial de [`actions/runner`](https://github.com/actions/runner/releases) | O GitHub não publica imagem oficial de runner |
| GitLab | `gitlab/gitlab-runner:latest` (imagem nativa do fornecedor) | É a imagem que a [documentação do GitLab](https://docs.gitlab.com/runner/install/docker/) instrui usar |

Sobre cada base aplicamos o nosso `entrypoint.sh`, que registra o runner lendo o token
de um arquivo em vez de variável de ambiente. O motor do GitHub também traz o cliente
Docker (com buildx e compose) e o `envsubst`: os jobs usam o daemon do host pelo socket
que o painel monta no container, então `services:` e `docker build` funcionam.

> Jobs com `container:` ainda não funcionam: o runner monta o diretório de trabalho
> pelo caminho, e esse caminho só existe dentro do container do runner, não no host.

A tag de cada imagem é um hash do seu contexto (`Dockerfile` + `entrypoint.sh`). Quando
o contexto muda, a tag muda e o painel reconstrói a imagem no próximo runner criado ou
editado. Runners existentes mostram o selo **Update available** e passam a usá-la pelo
botão **Update** (veja abaixo).

Se quiser construí-las antes (o primeiro `docker build` do GitHub leva alguns minutos),
use a sua própria tag e aponte o painel para ela:

```bash
docker build -t runnerbox/github-runner:local docker/github-runner
docker build -t runnerbox/gitlab-runner:local docker/gitlab-runner
# RUNNERBOX_GITHUB_IMAGE=runnerbox/github-runner:local
# RUNNERBOX_GITLAB_IMAGE=runnerbox/gitlab-runner:local
```

## Variáveis de ambiente

| Variável | Default | Para quê |
| --- | --- | --- |
| `RUNNERBOX_GITHUB_IMAGE` | `runnerbox/github-runner:<hash do contexto>` | Imagem dos runners do GitHub |
| `RUNNERBOX_GITLAB_IMAGE` | `runnerbox/gitlab-runner:<hash do contexto>` | Imagem dos runners do GitLab |
| `RUNNERBOX_SECRET_KEY` | gerada e salva em `<data>/key` | Chave AES-256 (32 bytes, base64 ou hex) |
| `RUNNERBOX_DATA_DIR` | `/var/lib/runnerbox` | Onde ficam a chave e os tokens cifrados |
| `RUNNERBOX_BUILD_CONTEXT_DIR` | `./docker` | Contextos de build dos motores |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Socket do daemon Docker |

## Tokens

- **GitHub:** *Settings → Actions → Runners → New self-hosted runner*. Uma URL
  `https://github.com/owner/repo` registra no repositório; `https://github.com/owner`
  registra na organização.
- **GitLab:** aceita tanto *registration token* quanto *authentication token* (`glrt-…`,
  padrão a partir do GitLab 16).

### Como o token é protegido

O token **nunca passa por variável de ambiente nem por label** — os dois são legíveis
em `docker inspect` por qualquer um com acesso ao daemon. Em vez disso:

1. O painel injeta o token no filesystem do container (`/run/runnerbox/token`, via
   `putArchive`) **antes** do start.
2. O `entrypoint.sh` lê o arquivo para uma variável de shell não exportada, registra o
   runner e então destrói o arquivo com `shred`.
3. O `shred` só acontece **depois** de o registro dar certo. Se falhar, o container
   reinicia e tenta de novo, em vez de ficar preso sem credencial.
4. Num restart posterior o runner já está registrado (`.runner` / `config.toml`), então
   nem token nem registro são necessários.

Em paralelo, o painel guarda uma cópia do token cifrada com **AES-256-GCM** em
`$RUNNERBOX_DATA_DIR/tokens.json` (modo 0600), para que **Editar** não exija redigitá-lo.
GCM e não CBC porque autentica o conteúdo: um arquivo adulterado falha na decifragem em
vez de devolver lixo. A chave vem de `RUNNERBOX_SECRET_KEY`; se você não definir uma, o
painel gera e persiste em `$RUNNERBOX_DATA_DIR/key` com permissão 0600.

## Editar, atualizar e excluir

**Editar** usa a estratégia **recreate**: o registro consome o token, então o painel remove
o container antigo (`docker rm -f`) e sobe um novo, que registra de novo com os valores
atualizados.

**Update** troca o container pela imagem mais recente **sem perder o registro** e sem pedir
token:

1. Reconstrói a imagem com pull da base (ou faz `docker pull` quando
   `RUNNERBOX_*_IMAGE` está definida). Se o container já usa essa imagem, não faz nada.
2. Copia o registro do container atual — `.runner`, `.credentials` e
   `.credentials_rsaparams` no GitHub; o diretório `/etc/gitlab-runner` no GitLab.
3. Encerra o container com `SIGKILL` (o `SIGTERM` faria o entrypoint desregistrar o runner)
   e o renomeia para `<nome>-old-…`.
4. Cria o container novo com o mesmo nome, devolve o registro a ele antes do start e
   confere que fica de pé por 10 segundos sem reiniciar.
5. Se tudo deu certo, remove o antigo; se algo falhou, remove o novo e restaura o antigo.

Um job em andamento é interrompido. No GitHub, o runner novo pode levar alguns instantes
para ficar online enquanto a sessão do antigo expira.

A exclusão faz `stop` seguido de `remove`.

## Publicação no Docker Hub (GitHub Actions)

A imagem é construída pelo workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml),
que usa a action [build-and-push-to-dockerhub](https://github.com/marketplace/actions/build-and-push-to-dockerhub)
sobre o `Dockerfile` da raiz (contexto `/`, plataforma `linux/amd64`).

Origem: `github.com/ediano/runnerbox-ci` → destino: `hub.docker.com/r/ediano/runnerbox-ci`.

| Gatilho | Tags publicadas |
| --- | --- |
| push na `main` | `latest` |
| git tag `v1.2.3` | `1.2.3` e `latest` |

- Todo push na `main` reconstrói `:latest` — é a tag que o `docker-compose.yml` consome.
- Uma git tag `v1.2.3` gera adicionalmente a tag imutável `1.2.3`, para quem não quer
  acompanhar a `main`.
- O workflow também aceita disparo manual (**Actions → Docker publish → Run workflow**).

Antes do primeiro run, cadastre em **Settings → Secrets and variables → Actions**:

| Secret | Valor |
| --- | --- |
| `DOCKERHUB_USERNAME` | usuário do Docker Hub (`ediano`) |
| `DOCKERHUB_TOKEN` | access token criado em Docker Hub → Account Settings → Personal access tokens, escopo *Read & Write* |

> Fallback manual, se precisar publicar da máquina local:
>
> ```bash
> docker build -t ediano/runnerbox-ci:latest .
> docker push ediano/runnerbox-ci:latest
> ```

## Testes

```bash
npm test     # Vitest sobre a lógica pura (runner-spec, crypto, tar)
npm run lint
```

## Ambiente de desenvolvimento

O [`.devcontainer/`](.devcontainer/devcontainer.json) traz Docker-in-Docker, para que
`docker build` e `docker run` da imagem final não interfiram nos containers do host.
A imagem base é fixada em *bookworm*: a tag genérica `:20` aponta para Debian *trixie*,
onde a feature `docker-in-docker` falha (o pacote `moby-cli` não existe nessa distro).
