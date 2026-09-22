import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContainerConfig,
  containerToRunner,
  containerNameFor,
  gitlabTokenFlag,
  parseGithubUrl,
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
    expect(errors).toContain("Plataforma deve ser 'github' ou 'gitlab'.");
  });

  it("rejeita URL malformada", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, url: "nao-e-url" });
    expect(ok).toBe(false);
    expect(errors).toContain("A URL deve ser um endereço http(s) válido.");
  });

  it("rejeita URL do GitHub sem owner", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, url: "https://github.com" });
    expect(ok).toBe(false);
    expect(errors).toContain(
      "A URL do GitHub deve apontar para uma organização ou repositório."
    );
  });

  it("rejeita token vazio", () => {
    const { ok, errors } = validateRunnerInput({ ...githubInput, token: "   " });
    expect(ok).toBe(false);
    expect(errors).toContain("O registration token é obrigatório.");
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
    expect(config.HostConfig.Binds).toContain("/var/run/docker.sock:/var/run/docker.sock");
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
    });
  });

  it("cai para o nome do container quando as labels faltam", () => {
    const runner = containerToRunner({ Id: "x", Names: ["/orfao"], State: "exited" });
    expect(runner.name).toBe("orfao");
    expect(runner.platform).toBe("unknown");
  });
});
