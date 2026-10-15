// Convenção de nomes dos containers filhos. Toda a descoberta de estado depende
// destas labels: sem banco de dados, o `docker inspect` é a única fonte da verdade.
export const CONTAINER_PREFIX = "runnerbox-worker-";

export const LABEL_MANAGED = "ci.runnerbox.managed";
export const LABEL_PLATFORM = "ci.runnerbox.platform";
export const LABEL_NAME = "ci.runnerbox.name";
export const LABEL_URL = "ci.runnerbox.url";
export const LABEL_CREATED_AT = "ci.runnerbox.createdAt";
// Limites e rede escolhidos no formulário. Ficam em labels pelo mesmo motivo das demais:
// é daqui que a atualização de imagem remonta o container sem perder a configuração.
export const LABEL_MEMORY = "ci.runnerbox.memoryMb";
export const LABEL_CPUS = "ci.runnerbox.cpus";
export const LABEL_NETWORK = "ci.runnerbox.network";
// Marca o próprio painel (vem do LABEL da imagem) e os containers de job do GitLab
// (via --docker-container-labels), para o painel de consumo saber quem é quem.
export const LABEL_ROLE = "ci.runnerbox.role";
export const LABEL_RUNNER = "ci.runnerbox.runner";

export const PLATFORMS = ["github", "gitlab"];

// "host" é o padrão histórico: o runner enxerga a rede da máquina como um processo
// comum. "bridge" isola o runner na rede padrão do Docker.
export const NETWORK_MODES = ["host", "bridge"];
export const DEFAULT_NETWORK = "host";
// Abaixo disso nem o runner do GitHub sobe com folga.
export const MIN_MEMORY_MB = 256;

export const PLATFORM_LABELS = {
  github: "GitHub Actions",
  gitlab: "GitLab CI",
};

export const DOCKER_SOCKET = "/var/run/docker.sock";

// Motores próprios, construídos sob demanda a partir de docker/{github,gitlab}-runner.
// Não há dependência de imagem de terceiros publicada em registry.
export function githubImage() {
  return process.env.RUNNERBOX_GITHUB_IMAGE || "runnerbox/github-runner:latest";
}

export function gitlabImage() {
  return process.env.RUNNERBOX_GITLAB_IMAGE || "runnerbox/gitlab-runner:latest";
}

// Onde o painel injeta o token dentro do container filho, via putArchive. Entregar
// por arquivo — e não por env var — é o que mantém o segredo fora do `docker inspect`.
export const TOKEN_DIR = "/run/runnerbox";
export const TOKEN_FILENAME = "token";
