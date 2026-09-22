// Única camada que fala com o daemon do Docker. Tudo que for decisão de configuração
// mora em runner-spec.js; aqui só há I/O.
import Docker from "dockerode";
import { DOCKER_SOCKET, LABEL_MANAGED, TOKEN_DIR, TOKEN_FILENAME } from "./constants.js";
import { ensureRunnerImage } from "./images.js";
import { createTar } from "./tar.js";
import { deleteToken, loadToken, pruneTokens, saveToken } from "./token-store.js";
import {
  buildContainerConfig,
  containerToRunner,
  validateRunnerInput,
} from "./runner-spec.js";

let client;

export function docker() {
  if (!client) {
    client = new Docker({ socketPath: process.env.DOCKER_SOCKET || DOCKER_SOCKET });
  }
  return client;
}

export async function listRunners() {
  // all: true para que runners parados/encerrados também apareçam na tabela (spec §3B).
  const containers = await docker().listContainers({
    all: true,
    filters: { label: [`${LABEL_MANAGED}=true`] },
  });
  const runners = containers
    .map(containerToRunner)
    .map((runner) => ({ ...runner, hasStoredToken: hasStoredToken(runner.id) }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  try {
    pruneTokens(runners.map((runner) => runner.id));
  } catch {
    // Um store inacessível não pode impedir a listagem dos runners.
  }

  return runners;
}

function assertValid(input) {
  const { ok, errors } = validateRunnerInput(input);
  if (!ok) {
    const error = new Error(errors.join(" "));
    error.validationErrors = errors;
    error.status = 400;
    throw error;
  }
}

export async function createRunner(input, onProgress = () => {}) {
  assertValid(input);

  const image = await ensureRunnerImage(docker(), input.platform, onProgress);
  const config = buildContainerConfig(input);
  config.Image = image;

  onProgress({ type: "phase", phase: "container", message: "Creating container…" });
  const container = await docker().createContainer(config);

  // O token entra pelo filesystem, antes do start, e o entrypoint o destrói após o
  // registro. Nunca passa por Env, logo não aparece em `docker inspect`.
  await container.putArchive(
    createTar([{ name: TOKEN_FILENAME, content: input.token, mode: 0o600 }]),
    { path: TOKEN_DIR }
  );

  onProgress({ type: "phase", phase: "start", message: "Starting runner…" });
  await container.start();

  // O runner já está de pé neste ponto. Falhar em guardar o token não pode
  // invalidar a criação: degradamos para "edição exigirá o token de novo".
  let tokenWarning = null;
  try {
    saveToken(container.id, input.token);
  } catch (err) {
    tokenWarning = `The runner was created, but its token could not be stored (${err.message}). Editing it will require entering the token again.`;
    console.warn("runnerbox:", tokenWarning);
  }

  const info = await container.inspect();
  const runner = containerToRunner({
    Id: info.Id,
    Names: [info.Name],
    State: info.State?.Status,
    Status: info.State?.Status,
    Image: info.Config?.Image,
    Labels: info.Config?.Labels,
  });
  return { ...runner, hasStoredToken: !tokenWarning, warning: tokenWarning };
}

// Estratégia recreate da spec §3C: as credenciais do runner são consumidas no
// registro, então não há como alterá-las sem destruir e recriar o container.
export async function recreateRunner(id, input, onProgress = () => {}) {
  // Token em branco significa "mantenha o atual": recuperamos a cópia cifrada.
  let stored = null;
  try {
    stored = loadToken(id);
  } catch (err) {
    console.warn("runnerbox: não foi possível ler o token guardado:", err.message);
  }
  const resolved = { ...input, token: input.token || stored };
  assertValid(resolved);

  onProgress({ type: "phase", phase: "removing", message: "Removing the current container…" });
  await docker().getContainer(id).remove({ force: true });
  safeDeleteToken(id);
  return createRunner(resolved, onProgress);
}

export async function removeRunner(id) {
  const container = docker().getContainer(id);
  try {
    await container.stop({ t: 30 });
  } catch (err) {
    // 304 = já parado; 404 = já removido por fora do painel. Ambos são sucesso aqui.
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }
  await container.remove({ force: true });
  safeDeleteToken(id);
}

// Remover o token é limpeza: um store inacessível não pode impedir a exclusão.
function safeDeleteToken(id) {
  try {
    deleteToken(id);
  } catch (err) {
    console.warn("runnerbox: não foi possível apagar o token guardado:", err.message);
  }
}

export function hasStoredToken(id) {
  try {
    return Boolean(loadToken(id));
  } catch {
    return false;
  }
}
