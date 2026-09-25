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
} from "./constants.js";

export function validateRunnerInput(input) {
  const errors = [];
  const { platform, url, token, name } = input || {};

  if (!PLATFORMS.includes(platform)) {
    errors.push("Platform must be either 'github' or 'gitlab'.");
  }

  if (!url || typeof url !== "string" || !url.trim()) {
    errors.push("URL is required.");
  } else {
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      parsed = null;
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      errors.push("URL must be a valid http(s) address.");
    } else if (platform === "github" && !parsed.pathname.replace(/^\/|\/$/g, "")) {
      errors.push("The GitHub URL must point to an organization or a repository.");
    }
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    errors.push("Registration token is required.");
  }

  if (name !== undefined && name !== null && name !== "" && !slugify(name)) {
    errors.push("Runner name must contain at least one letter or digit.");
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
  // O token é deliberadamente omitido: ele chega ao container por arquivo (putArchive),
  // porque tudo que entra em Env fica legível em `docker inspect`.
  const env = [
    `RUNNER_NAME=${runnerName}`,
    `RUNNER_SCOPE=${scope}`,
    `RUNNER_WORKDIR=/tmp/runner/work`,
    `RUNNER_URL=${input.url}`,
    `DISABLE_AUTO_UPDATE=true`,
  ];
  if (scope === "repo") env.push(`REPO_URL=${repoUrl}`);
  else env.push(`ORG_NAME=${orgName}`);
  return env;
}

function buildGitlabEnv(input, runnerName) {
  // Mesma regra do GitHub: nada de token em variável de ambiente.
  return [
    `RUNNER_NAME=${runnerName}`,
    `CI_SERVER_URL=${input.url}`,
    `RUNNER_EXECUTOR=docker`,
    `DOCKER_IMAGE=alpine:latest`,
  ];
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
      NetworkMode: "host",
      Binds: [`${DOCKER_SOCKET}:${DOCKER_SOCKET}`],
    },
  };

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

// Onde cada runner guarda o próprio registro. Copiar estes caminhos para um container
// novo é o que permite trocar a imagem sem registrar de novo: o entrypoint vê o
// registro presente e pula direto para o `run`, sem precisar de token.
const REGISTRATION_PATHS = {
  github: [
    "/actions-runner/.runner",
    "/actions-runner/.credentials",
    "/actions-runner/.credentials_rsaparams",
  ],
  // O diretório inteiro, e não só o config.toml: o .runner_system_id que mora ao lado
  // identifica a máquina no GitLab, e perdê-lo faria o runner aparecer duplicado.
  gitlab: ["/etc/gitlab-runner"],
};

// O arquivo que só existe depois de um registro bem-sucedido. Checá-lo antes de parar
// o container evita derrubar um runner que não teria como voltar sem token.
const REGISTRATION_MARKERS = {
  github: "/actions-runner/.runner",
  gitlab: "/etc/gitlab-runner/config.toml",
};

export function registrationPaths(platform) {
  const paths = REGISTRATION_PATHS[platform];
  if (!paths) throw new Error(`Unknown platform: ${platform}`);
  return paths;
}

export function registrationMarker(platform) {
  const marker = REGISTRATION_MARKERS[platform];
  if (!marker) throw new Error(`Unknown platform: ${platform}`);
  return marker;
}

// A configuração do container novo sai das labels do antigo, e não do seu Env: o Env
// do inspect vem misturado com o ENV da imagem velha, que sobrescreveria o da nova.
export function buildUpdateConfig(containerInfo) {
  const labels = containerInfo?.Config?.Labels || {};
  const platform = labels[LABEL_PLATFORM];
  if (!PLATFORMS.includes(platform) || !labels[LABEL_URL]) {
    throw new Error("This container is missing the RunnerBox labels needed to update it.");
  }
  return buildContainerConfig(
    { platform, url: labels[LABEL_URL], name: labels[LABEL_NAME] },
    {
      runnerName: labels[LABEL_NAME],
      containerName: String(containerInfo.Name || "").replace(/^\//, ""),
      createdAt: labels[LABEL_CREATED_AT],
    }
  );
}

// Só uma troca de tag é detectável sem tocar no registry ou rebuildar; é o que basta
// para avisar que o painel traz uma versão nova do motor do runner.
export function hasNewerImage(runner, latestImage) {
  return Boolean(runner?.image && latestImage && runner.image !== latestImage);
}

// Ações de ciclo de vida que o painel expõe além de criar, editar, atualizar e excluir.
export const RUNNER_ACTIONS = ["start", "stop", "restart"];

// Quais dessas ações fazem sentido para o estado atual do container, para a tabela não
// oferecer "Start" a um runner rodando nem "Restart" a um parado.
export function availableActions(state) {
  if (state === "running" || state === "restarting") return ["stop", "restart"];
  if (["paused", "exited", "created", "dead"].includes(state)) return ["start"];
  return [];
}
