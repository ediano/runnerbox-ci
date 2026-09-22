// Convenção de nomes dos containers filhos. Toda a descoberta de estado depende
// destas labels: sem banco de dados, o `docker inspect` é a única fonte da verdade.
export const CONTAINER_PREFIX = "runnerbox-worker-";

export const LABEL_MANAGED = "ci.runnerbox.managed";
export const LABEL_PLATFORM = "ci.runnerbox.platform";
export const LABEL_NAME = "ci.runnerbox.name";
export const LABEL_URL = "ci.runnerbox.url";
export const LABEL_CREATED_AT = "ci.runnerbox.createdAt";

export const PLATFORMS = ["github", "gitlab"];

export const PLATFORM_LABELS = {
  github: "GitHub Actions",
  gitlab: "GitLab CI",
};

export const DOCKER_SOCKET = "/var/run/docker.sock";

// Imagens padrão públicas, para o painel funcionar sem build manual. As imagens
// base próprias ficam em docker/{github,gitlab}-runner e entram por estas env vars.
export function githubImage() {
  return process.env.RUNNERBOX_GITHUB_IMAGE || "myoung34/docker-github-actions-runner:latest";
}

export function gitlabImage() {
  return process.env.RUNNERBOX_GITLAB_IMAGE || "gitlab/gitlab-runner:latest";
}

// As imagens base próprias já se registram sozinhas via entrypoint.sh, então não
// precisam do Entrypoint improvisado que a imagem oficial do GitLab exige.
export function isOwnGitlabImage(image) {
  return /^runnerbox\//.test(image);
}
