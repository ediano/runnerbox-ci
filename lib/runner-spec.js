// Lógica pura de montagem de runners: nada aqui importa dockerode nem toca no daemon.
// Todo comportamento não trivial (escopo do GitHub, tipo de token do GitLab, labels)
// vive neste arquivo justamente para ser testável sem Docker.
import {
  CONTAINER_PREFIX,
  DOCKER_SOCKET,
  LABEL_CREATED_AT,
  LABEL_MANAGED,
  LABEL_NAME,
  LABEL_PLATFORM,
  LABEL_URL,
  PLATFORMS,
  githubImage,
  gitlabImage,
  isOwnGitlabImage,
} from "./constants.js";

export function validateRunnerInput(input) {
  const errors = [];
  const { platform, url, token, name } = input || {};

  if (!PLATFORMS.includes(platform)) {
    errors.push("Plataforma deve ser 'github' ou 'gitlab'.");
  }

  if (!url || typeof url !== "string" || !url.trim()) {
    errors.push("A URL é obrigatória.");
  } else {
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      parsed = null;
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      errors.push("A URL deve ser um endereço http(s) válido.");
    } else if (platform === "github" && !parsed.pathname.replace(/^\/|\/$/g, "")) {
      errors.push("A URL do GitHub deve apontar para uma organização ou repositório.");
    }
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    errors.push("O registration token é obrigatório.");
  }

  if (name !== undefined && name !== null && name !== "" && !slugify(name)) {
    errors.push("O nome do runner deve conter ao menos uma letra ou número.");
  }

  return { ok: errors.length === 0, errors };
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function containerNameFor(input, suffix) {
  const slug = slugify(input?.name);
  if (slug) return `${CONTAINER_PREFIX}${slug}`;
  const random = suffix || Math.random().toString(36).slice(2, 8);
  return `${CONTAINER_PREFIX}${input?.platform || "runner"}-${random}`;
}

// O runner do GitHub registra em escopo de repositório ou de organização, e cada
// escopo usa uma variável de ambiente diferente — daí a necessidade de olhar o path.
export function parseGithubUrl(url) {
  const parsed = new URL(String(url).trim());
  const segments = parsed.pathname.split("/").filter(Boolean);
  const base = `${parsed.protocol}//${parsed.host}`;

  if (segments.length >= 2) {
    return {
      scope: "repo",
      repoUrl: `${base}/${segments[0]}/${segments[1]}`,
      orgName: segments[0],
    };
  }

  return { scope: "org", repoUrl: null, orgName: segments[0] };
}

// O GitLab 16 depreciou os registration tokens em favor de authentication tokens
// (prefixo glrt-), que usam uma flag diferente no `gitlab-runner register`.
export function gitlabTokenFlag(token) {
  return String(token ?? "").startsWith("glrt-") ? "--token" : "--registration-token";
}

function buildGithubEnv(input, runnerName) {
  const { scope, repoUrl, orgName } = parseGithubUrl(input.url);
  const env = [
    `RUNNER_NAME=${runnerName}`,
    `RUNNER_TOKEN=${input.token}`,
    `RUNNER_SCOPE=${scope}`,
    `RUNNER_WORKDIR=/tmp/runner/work`,
    // RUNNER_URL é lido pelo nosso entrypoint.sh; REPO_URL/ORG_NAME pela imagem pública.
    `RUNNER_URL=${input.url}`,
    `DISABLE_AUTO_UPDATE=true`,
  ];
  if (scope === "repo") env.push(`REPO_URL=${repoUrl}`);
  else env.push(`ORG_NAME=${orgName}`);
  return env;
}

function buildGitlabEnv(input, runnerName) {
  return [
    `RUNNER_NAME=${runnerName}`,
    `CI_SERVER_URL=${input.url}`,
    `REGISTRATION_TOKEN=${input.token}`,
    `RUNNER_EXECUTOR=docker`,
    `DOCKER_IMAGE=alpine:latest`,
  ];
}

// A imagem oficial gitlab/gitlab-runner não se registra a partir de env vars: ela só
// executa `gitlab-runner run`. Injetamos o registro como Entrypoint para que a imagem
// pública funcione sem build. As imagens base próprias já fazem isso no entrypoint.sh.
export function gitlabBootstrapCommand(input) {
  const flag = gitlabTokenFlag(input.token);
  const script = [
    "gitlab-runner register --non-interactive",
    `--url "$CI_SERVER_URL"`,
    `${flag} "$REGISTRATION_TOKEN"`,
    `--name "$RUNNER_NAME"`,
    `--executor "$RUNNER_EXECUTOR"`,
    `--docker-image "$DOCKER_IMAGE"`,
    `--docker-volumes ${DOCKER_SOCKET}:${DOCKER_SOCKET}`,
    "&& exec gitlab-runner run --user=gitlab-runner --working-directory=/home/gitlab-runner",
  ].join(" ");
  return ["/bin/sh", "-c", script];
}

export function buildContainerConfig(input, options = {}) {
  const runnerName = options.runnerName || slugify(input.name) || containerNameFor(input);
  const containerName = options.containerName || containerNameFor(input);
  const createdAt = options.createdAt || new Date().toISOString();
  const isGithub = input.platform === "github";
  const image = isGithub ? githubImage() : gitlabImage();

  const config = {
    name: containerName,
    Image: image,
    Env: isGithub ? buildGithubEnv(input, runnerName) : buildGitlabEnv(input, runnerName),
    // O token fica de fora das labels de propósito: labels aparecem em texto puro
    // no `docker inspect`. Por isso editar um runner exige reinformar o token.
    Labels: {
      [LABEL_MANAGED]: "true",
      [LABEL_PLATFORM]: input.platform,
      [LABEL_NAME]: runnerName,
      [LABEL_URL]: input.url,
      [LABEL_CREATED_AT]: createdAt,
    },
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      Binds: [`${DOCKER_SOCKET}:${DOCKER_SOCKET}`],
    },
  };

  if (!isGithub && !isOwnGitlabImage(image)) {
    config.Entrypoint = gitlabBootstrapCommand(input);
  }

  return config;
}

export function containerToRunner(containerInfo) {
  const labels = containerInfo.Labels || {};
  const rawName = (containerInfo.Names && containerInfo.Names[0]) || "";
  return {
    id: containerInfo.Id,
    containerName: rawName.replace(/^\//, ""),
    name: labels[LABEL_NAME] || rawName.replace(/^\//, ""),
    platform: labels[LABEL_PLATFORM] || "unknown",
    url: labels[LABEL_URL] || "",
    state: containerInfo.State || "unknown",
    status: containerInfo.Status || "",
    image: containerInfo.Image || "",
    createdAt: labels[LABEL_CREATED_AT] || null,
  };
}
