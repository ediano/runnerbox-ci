import { beforeEach, describe, expect, it } from "vitest";
import {
  availableActions,
  buildContainerConfig,
  buildUpdateConfig,
  containerToRunner,
  containerNameFor,
  gitlabTokenFlag,
  hasNewerImage,
  normalizeResources,
  parseGithubUrl,
  registrationMarker,
  registrationPaths,
  slugify,
  validateRunnerInput,
} from "./runner-spec.js";

const githubInput = {
  platform: "github",
  url: "https://github.com/acme/app",
  token: "AAAA1111",
  name: "Runner de Build",
};

const gitlabInput = {
  platform: "gitlab",
  url: "https://gitlab.com",
  token: "GR1348941abc",
  name: "gitlab-1",
};

beforeEach(() => {
  delete process.env.RUNNERBOX_GITHUB_IMAGE;
  delete process.env.RUNNERBOX_GITLAB_IMAGE;
});

describe("validateRunnerInput", () => {
  it("aceita uma entrada completa", () => {
    expect(validateRunnerInput(githubInput)).toEqual({ ok: true, errors: [] });
  });

  it("rejeita plataforma desconhecida", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, platform: "bitbucket" });
    expect(ok).toBe(false);
    expect(errors).toContain("Platform must be either 'github' or 'gitlab'.");
  });

  it("rejeita URL malformada", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, url: "nao-e-url" });
    expect(ok).toBe(false);
    expect(errors).toContain("URL must be a valid http(s) address.");
  });

  it("rejeita URL do GitHub sem owner", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, url: "https://github.com" });
    expect(ok).toBe(false);
    expect(errors).toContain(
      "The GitHub URL must point to an organization or a repository."
    );
  });

  it("rejeita token vazio", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, token: "   " });
    expect(ok).toBe(false);
    expect(errors).toContain("Registration token is required.");
  });

  it("aceita nome ausente mas rejeita nome sem caracteres úteis", () => {
    expect(validateRunnerInput({ ...githubInput, name: "" }).ok).toBe(true);
    expect(validateRunnerInput({ ...githubInput, name: "!!!" }).ok).toBe(false);
  });
});

describe("parseGithubUrl", () => {
  it("trata owner/repo como escopo de repositório", () => {
    expect(parseGithubUrl("https://github.com/acme/app")).toEqual({
      scope: "repo",
      repoUrl: "https://github.com/acme/app",
      orgName: "acme",
    });
  });

  it("trata apenas o owner como escopo de organização", () => {
    expect(parseGithubUrl("https://github.com/acme")).toEqual({
      scope: "org",
      repoUrl: null,
      orgName: "acme",
    });
  });

  it("preserva o host em instâncias GitHub Enterprise", () => {
    expect(parseGithubUrl("https://ghe.interno.com/acme/app/").repoUrl).toBe(
      "https://ghe.interno.com/acme/app"
    );
  });
});

describe("gitlabTokenFlag", () => {
  it("usa --token para authentication tokens do GitLab 16+", () => {
    expect(gitlabTokenFlag("glrt-abc123")).toBe("--token");
  });

  it("usa --registration-token para os tokens legados", () => {
    expect(gitlabTokenFlag("GR1348941abc")).toBe("--registration-token");
  });
});

describe("slugify / containerNameFor", () => {
  it("normaliza acentos e espaços", () => {
    expect(slugify("Runner de Integração")).toBe("runner-de-integracao");
  });

  it("prefixa o container com runnerbox-worker-", () => {
    expect(containerNameFor(githubInput)).toBe("runnerbox-worker-runner-de-build");
  });

  it("gera um nome estável quando não há nome informado", () => {
    expect(containerNameFor({ platform: "gitlab" }, "xyz123")).toBe(
      "runnerbox-worker-gitlab-xyz123"
    );
  });
});

describe("buildContainerConfig", () => {
  it("monta o env do GitHub em escopo de repositório", () => {
    const config = buildContainerConfig(githubInput);
    expect(config.name).toBe("runnerbox-worker-runner-de-build");
    expect(config.Image).toBe("runnerbox/github-runner:latest");
    expect(config.Env).toContain("RUNNER_SCOPE=repo");
    expect(config.Env).toContain("REPO_URL=https://github.com/acme/app");
    expect(config.Env).not.toContain("ORG_NAME=acme");
  });

  it("monta o env do GitHub em escopo de organização", () => {
    const config = buildContainerConfig({ ...githubInput, url: "https://github.com/acme" });
    expect(config.Env).toContain("RUNNER_SCOPE=org");
    expect(config.Env).toContain("ORG_NAME=acme");
    expect(config.Env.some((entry) => entry.startsWith("REPO_URL="))).toBe(false);
  });

  it("monta o env do GitLab", () => {
    const config = buildContainerConfig(gitlabInput);
    expect(config.Env).toContain("CI_SERVER_URL=https://gitlab.com");
    expect(config.Env).toContain("RUNNER_EXECUTOR=docker");
  });

  it("nunca coloca o token em variável de ambiente", () => {
    for (const input of [githubInput, gitlabInput]) {
      const env = buildContainerConfig(input).Env;
      expect(env.join("\n")).not.toContain(input.token);
    }
  });

  it("não define Entrypoint: o motor próprio já se registra sozinho", () => {
    expect(buildContainerConfig(gitlabInput).Entrypoint).toBeUndefined();
  });

  it("nunca grava o token nas labels", () => {
    const labels = buildContainerConfig(githubInput).Labels;
    expect(Object.values(labels)).not.toContain("AAAA1111");
    expect(JSON.stringify(labels)).not.toContain("AAAA1111");
  });

  it("aplica as labels de descoberta e o restart policy", () => {
    const config = buildContainerConfig(githubInput, { createdAt: "2026-01-01T00:00:00.000Z" });
    expect(config.Labels).toMatchObject({
      "ci.runnerbox.managed": "true",
      "ci.runnerbox.platform": "github",
      "ci.runnerbox.name": "runner-de-build",
      "ci.runnerbox.url": "https://github.com/acme/app",
      "ci.runnerbox.createdAt": "2026-01-01T00:00:00.000Z",
    });
    expect(config.HostConfig.RestartPolicy).toEqual({ Name: "unless-stopped" });
    expect(config.HostConfig.NetworkMode).toBe("host");
    expect(config.HostConfig.Binds).toContain("/var/run/docker.sock:/var/run/docker.sock");
  });

  it("sem limites, não define Memory nem NanoCpus", () => {
    const config = buildContainerConfig(githubInput);
    expect(config.HostConfig.Memory).toBeUndefined();
    expect(config.HostConfig.MemorySwap).toBeUndefined();
    expect(config.HostConfig.NanoCpus).toBeUndefined();
    expect(config.Labels["ci.runnerbox.memoryMb"]).toBeUndefined();
    expect(config.Labels["ci.runnerbox.cpus"]).toBeUndefined();
    expect(config.Labels["ci.runnerbox.network"]).toBe("host");
  });

  it("aplica memória, CPU e rede escolhidas", () => {
    const config = buildContainerConfig({ ...githubInput, memoryMb: 512, cpus: "1.5", network: "bridge" });
    expect(config.HostConfig).toMatchObject({
      NetworkMode: "bridge",
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1_500_000_000,
    });
    expect(config.Labels).toMatchObject({
      "ci.runnerbox.memoryMb": "512",
      "ci.runnerbox.cpus": "1.5",
      "ci.runnerbox.network": "bridge",
    });
  });

  it("repassa os limites aos jobs do GitLab, mas não a rede", () => {
    const env = buildContainerConfig({ ...gitlabInput, memoryMb: 1024, cpus: 2, network: "bridge" }).Env;
    expect(env).toContain("RUNNER_JOB_MEMORY=1024");
    expect(env).toContain("RUNNER_JOB_CPUS=2");
    expect(env.some((entry) => entry.startsWith("RUNNER_JOB_NETWORK"))).toBe(false);
  });

  it("não passa limite de job ao GitLab quando não há limite", () => {
    const env = buildContainerConfig(gitlabInput).Env;
    expect(env.some((entry) => entry.startsWith("RUNNER_JOB_"))).toBe(false);
  });

  it("respeita o override de imagem por env var", () => {
    process.env.RUNNERBOX_GITHUB_IMAGE = "runnerbox/github-runner:dev";
    expect(buildContainerConfig(githubInput).Image).toBe("runnerbox/github-runner:dev");
  });
});

describe("containerToRunner", () => {
  it("converte a resposta do dockerode em um runner", () => {
    const runner = containerToRunner({
      Id: "abc123",
      Names: ["/runnerbox-worker-build"],
      State: "running",
      Status: "Up 2 minutes",
      Image: "runnerbox/github-runner:latest",
      Labels: {
        "ci.runnerbox.managed": "true",
        "ci.runnerbox.platform": "github",
        "ci.runnerbox.name": "build",
        "ci.runnerbox.url": "https://github.com/acme/app",
        "ci.runnerbox.createdAt": "2026-01-01T00:00:00.000Z",
      },
    });

    expect(runner).toEqual({
      id: "abc123",
      containerName: "runnerbox-worker-build",
      name: "build",
      platform: "github",
      url: "https://github.com/acme/app",
      state: "running",
      status: "Up 2 minutes",
      image: "runnerbox/github-runner:latest",
      createdAt: "2026-01-01T00:00:00.000Z",
      resources: { memoryMb: null, cpus: null, network: "host" },
    });
  });

  it("lê os limites e a rede das labels", () => {
    const runner = containerToRunner({
      Id: "abc",
      Names: ["/x"],
      Labels: { "ci.runnerbox.memoryMb": "2048", "ci.runnerbox.cpus": "1.5", "ci.runnerbox.network": "bridge" },
    });
    expect(runner.resources).toEqual({ memoryMb: 2048, cpus: 1.5, network: "bridge" });
  });

  it("cai para o nome do container quando as labels faltam", () => {
    const runner = containerToRunner({ Id: "x", Names: ["/orfao"], State: "exited" });
    expect(runner.name).toBe("orfao");
    expect(runner.platform).toBe("unknown");
  });
});

describe("registrationPaths", () => {
  it("lista as credenciais do runner do GitHub", () => {
    expect(registrationPaths("github")).toEqual([
      "/actions-runner/.runner",
      "/actions-runner/.credentials",
      "/actions-runner/.credentials_rsaparams",
    ]);
  });

  it("copia o diretório inteiro do GitLab, com o system id", () => {
    expect(registrationPaths("gitlab")).toEqual(["/etc/gitlab-runner"]);
  });

  it("recusa plataforma desconhecida", () => {
    expect(() => registrationPaths("bitbucket")).toThrow();
    expect(() => registrationMarker("bitbucket")).toThrow();
  });

  it("o marcador de registro fica dentro do que é copiado", () => {
    for (const platform of ["github", "gitlab"]) {
      const marker = registrationMarker(platform);
      expect(registrationPaths(platform).some((p) => marker === p || marker.startsWith(`${p}/`))).toBe(true);
    }
  });
});

describe("buildUpdateConfig", () => {
  const created = buildContainerConfig(githubInput, { createdAt: "2026-01-01T00:00:00.000Z" });
  const inspectInfo = {
    Name: `/${created.name}`,
    Config: {
      Labels: created.Labels,
      // Env de imagem antiga misturado: não pode vazar para o container novo.
      Env: [...created.Env, "PATH=/old/bin"],
    },
  };

  it("reconstrói a mesma configuração a partir das labels", () => {
    expect(buildUpdateConfig(inspectInfo)).toEqual(created);
  });

  it("preserva limites e rede na atualização", () => {
    const limited = buildContainerConfig(
      { ...gitlabInput, memoryMb: 768, cpus: 0.5, network: "bridge" },
      { createdAt: "2026-01-01T00:00:00.000Z" }
    );
    const info = { Name: `/${limited.name}`, Config: { Labels: limited.Labels, Env: limited.Env } };
    expect(buildUpdateConfig(info)).toEqual(limited);
  });

  it("mantém host e sem limite para containers anteriores aos limites", () => {
    const { "ci.runnerbox.network": _network, ...legacyLabels } = created.Labels;
    const config = buildUpdateConfig({ ...inspectInfo, Config: { ...inspectInfo.Config, Labels: legacyLabels } });
    expect(config.HostConfig.NetworkMode).toBe("host");
    expect(config.HostConfig.Memory).toBeUndefined();
  });

  it("não herda o Env da imagem antiga", () => {
    expect(buildUpdateConfig(inspectInfo).Env).not.toContain("PATH=/old/bin");
  });

  it("recusa container sem as labels do painel", () => {
    expect(() => buildUpdateConfig({ Name: "/x", Config: { Labels: {} } })).toThrow(/labels/);
  });
});

describe("hasNewerImage", () => {
  it("detecta troca de tag", () => {
    expect(hasNewerImage({ image: "runnerbox/github-runner:aaa" }, "runnerbox/github-runner:bbb")).toBe(true);
    expect(hasNewerImage({ image: "runnerbox/github-runner:aaa" }, "runnerbox/github-runner:aaa")).toBe(false);
  });

  it("não acusa atualização sem informação", () => {
    expect(hasNewerImage({ image: "" }, "x")).toBe(false);
    expect(hasNewerImage({ image: "x" }, null)).toBe(false);
  });
});

describe("availableActions", () => {
  it("offers stop and restart while the container is up", () => {
    expect(availableActions("running")).toEqual(["stop", "restart"]);
    expect(availableActions("restarting")).toEqual(["stop", "restart"]);
  });

  it("offers start when the container is down", () => {
    for (const state of ["paused", "exited", "created", "dead"]) {
      expect(availableActions(state)).toEqual(["start"]);
    }
  });

  it("offers nothing for unknown states", () => {
    expect(availableActions("removing")).toEqual([]);
    expect(availableActions(undefined)).toEqual([]);
  });
});

describe("validação de recursos", () => {
  const host = { cpus: 4, memoryMb: 8192 };
  const errorsFor = (resources) => validateRunnerInput({ ...githubInput, ...resources }, host).errors;

  it("aceita campos vazios como sem limite", () => {
    expect(errorsFor({ memoryMb: "", cpus: "", network: "" })).toEqual([]);
    expect(errorsFor({ memoryMb: null, cpus: undefined })).toEqual([]);
  });

  it("aceita valores dentro da máquina", () => {
    expect(errorsFor({ memoryMb: 4096, cpus: "2.5", network: "bridge" })).toEqual([]);
  });

  it("recusa memória abaixo do mínimo, fracionada ou maior que o host", () => {
    expect(errorsFor({ memoryMb: 128 })).toHaveLength(1);
    expect(errorsFor({ memoryMb: 512.5 })).toHaveLength(1);
    expect(errorsFor({ memoryMb: 9000 })[0]).toMatch(/8192 MB/);
    expect(errorsFor({ memoryMb: "abc" })).toHaveLength(1);
  });

  it("recusa CPU zero, negativa ou maior que o host", () => {
    expect(errorsFor({ cpus: 0 })).toHaveLength(1);
    expect(errorsFor({ cpus: -1 })).toHaveLength(1);
    expect(errorsFor({ cpus: 5 })[0]).toMatch(/4 CPUs/);
  });

  it("recusa rede desconhecida", () => {
    expect(errorsFor({ network: "none" })[0]).toMatch(/host, bridge/);
  });

  it("sem dados do host, só checa os mínimos", () => {
    expect(validateRunnerInput({ ...githubInput, memoryMb: 999999, cpus: 128 }).errors).toEqual([]);
  });
});

describe("normalizeResources", () => {
  it("aplica os padrões", () => {
    expect(normalizeResources({})).toEqual({ memoryMb: null, cpus: null, network: "host" });
  });

  it("converte texto em número", () => {
    expect(normalizeResources({ memoryMb: "1024", cpus: "0.5", network: "bridge" })).toEqual({
      memoryMb: 1024,
      cpus: 0.5,
      network: "bridge",
    });
  });
});
