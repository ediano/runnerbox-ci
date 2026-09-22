# Especificação de Projeto: MVP Local para Gestão de Runners (GitHub Actions & GitLab CI)

## 1. Visão Geral
Construir um painel de controle local em container Docker para gerenciar o ciclo de vida (CRUD) de *self-hosted runners* do **GitHub Actions** e executores do **GitLab CI**. O objetivo é eliminar o isolamento por repositório e simplificar a configuração através de uma interface web simples, sem necessidade de autenticação de usuários (foco em uso local/desenvolvedor).

---

## 2. Requisitos Técnicos e Arquitetura
- **Empacotamento:** A aplicação deve rodar dentro de um único container Docker e ser disponibilizada no Docker Hub.
- **Gerenciamento de Containers:** O backend deve interagir com o Docker do host através do mapeamento do socket (`/var/run/docker.sock`).
- **Isolamento:** Cada runner gerenciado deve subir como um container filho independente, identificado por um prefixo ou tag específica (ex: `runner-manager-worker-*`) para facilitar a listagem, atualização e remoção.
- **Persistência/Estado:** O estado dos runners é gerido dinamicamente consultando diretamente a API/SDK do Docker (`docker ps` / endpoints equivalentes), evitando banco de dados complexos para o MVP.

### Stack escolhida
- **Frontend + Backend:** Next.js (React) com API Routes em Node.js.
- **SDK Docker:** `dockerode`.

### Portas
As portas padrão (3000/8080) já estão ocupadas por outro container na máquina do desenvolvedor. O projeto usa:

| Uso | Porta |
| --- | --- |
| Dev server (`npm run dev`) | `2131` |
| App empacotada (`npm start` / imagem final) | `2141` |

---

## 3. Escopo Funcional (CRUD de Runners)

### A. Create (Criar / Ativar)
O usuário preenche um formulário simples escolhendo a plataforma e informando as credenciais:

* **GitHub Actions:**
  * URL do Repositório ou Organização.
  * *Registration Token* do GitHub.
  * Nome opcional do Runner.
* **GitLab CI:**
  * URL (suportando tanto o escopo global/instance-wide, group-level ou project-level).
  * *Registration Token* do GitLab.
  * Nome opcional do Runner.

**Ação do Backend:** Baixa/utiliza a imagem oficial do runner correspondente e dispara um container em segundo plano (`docker run -d`) injetando as variáveis de ambiente necessárias.

### B. Read (Listagem)
* Uma tabela ou lista em tempo real na interface web exibindo os containers ativos gerenciados pela ferramenta.
* Informações exibidas: nome do runner, plataforma (GitHub/GitLab), status atual (`Running`, `Stopped`, etc.) e ações disponíveis.

### C. Update (Atualização)
* Permitir editar as configurações de um runner existente.
* Como o runner depende de variáveis de ambiente de registro, a "atualização" ocorre via estratégia de **recreate**: para o container antigo, remove via `docker rm -f`, e sobe um novo container atualizado com as novas credenciais.

### D. Delete (Exclusão)
* Botão de exclusão na linha da tabela.
* **Ação do Backend:** Executa a parada forçada e a remoção limpa do container correspondente (`docker stop` e `docker rm`), liberando os recursos da máquina hospedeira.

---

## 4. Experiência do Usuário (UI/UX)
* **Design:** Minimalista, limpo e direto ao ponto (React/Next.js com Tailwind).
* **Fluxo:**
  1. Header/Rodapé com os devidos créditos aos criadores.
  2. Cards de seleção rápida (GitHub Actions vs GitLab CI).
  3. Formulário dinâmico baseado na plataforma escolhida.
  4. Logo abaixo, o painel de gerenciamento listando os runners ativos com os botões de Ação (`Editar` / `Excluir`).

---

## 5. Estrutura de Entrega Esperada
1. **Dockerfile** para empacotar a aplicação principal (Painel Frontend + Backend API).
2. **`docker-compose.yml`** de exemplo demonstrando como o usuário final roda a ferramenta localmente, mapeando o Docker socket:

   ```yaml
   services:
     runner-manager:
       image: seu-usuario/runner-manager:latest
       container_name: runner-manager
       ports:
         - "2141:2141"
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
       restart: unless-stopped
   ```

3. Scripts de entrada (`entrypoint.sh`) para os runners do GitHub e GitLab encapsulados em imagens base.

---

## 6. Ambiente de Desenvolvimento (Dev Container)
Configurado em `.devcontainer/devcontainer.json`:

- Imagem base: `mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm`.
  - **Importante:** a tag genérica `:20` aponta para Debian *trixie*, onde a feature `docker-in-docker` falha (o pacote `moby-cli` não existe nessa distro). Por isso a imagem é fixada em *bookworm*.
- Feature `ghcr.io/devcontainers/features/docker-in-docker:2` — dá um daemon Docker completo dentro do devcontainer, permitindo `docker build` e `docker run` da imagem final sem interferir nos containers do host.
- Portas encaminhadas: `2131` e `2141`.
- `postCreateCommand`: `npm install`.

### Verificação
1. "Dev Containers: Reopen in Container" no VSCode.
2. `docker --version` dentro do container (valida o Docker-in-Docker).
3. `npm run dev` e acessar `localhost:2131` a partir do host.
