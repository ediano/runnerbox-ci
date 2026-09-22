// Única camada que fala com o daemon do Docker. Tudo que for decisão de configuração
// mora em runner-spec.js; aqui só há I/O.
import path from "node:path";
import Docker from "dockerode";
import {
  DOCKER_SOCKET,
  LABEL_MANAGED,
  LABEL_NAME,
  LABEL_PLATFORM,
  PLATFORMS,
  TOKEN_DIR,
  TOKEN_FILENAME,
} from "./constants.js";
import { ensureRunnerImage, imageFor } from "./images.js";
import { createTar } from "./tar.js";
import { deleteToken, loadToken, pruneTokens, saveToken } from "./token-store.js";
import {
  buildContainerConfig,
  buildUpdateConfig,
  containerToRunner,
  hasNewerImage,
  registrationMarker,
  registrationPaths,
  validateRunnerInput,
} from "./runner-spec.js";

// Quanto tempo o container novo precisa ficar de pé, sem reiniciar, para a
// atualização ser dada como boa. Um registro que não pegou derruba o entrypoint
// logo nos primeiros segundos.
const UPDATE_HEALTH_CHECK_MS = 10_000;

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
  const latest = Object.fromEntries(PLATFORMS.map((platform) => [platform, imageFor(platform)]));
  const runners = containers
    .map(containerToRunner)
    .map((runner) => ({
      ...runner,
      hasStoredToken: hasStoredToken(runner.id),
      updateAvailable: hasNewerImage(runner, latest[runner.platform]),
    }))
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

  const runner = runnerFromInspect(await container.inspect());
  return { ...runner, hasStoredToken: !tokenWarning, warning: tokenWarning };
}

function runnerFromInspect(info) {
  return containerToRunner({
    Id: info.Id,
    Names: [info.Name],
    State: info.State?.Status,
    Status: info.State?.Status,
    Image: info.Config?.Image,
    Labels: info.Config?.Labels,
  });
}

// Troca a imagem mantendo o registro: diferente do recreate, não consome token. O
// registro é copiado do container antigo para o novo antes do start, e o entrypoint,
// ao encontrá-lo, pula o `register`. O antigo fica renomeado até o novo se provar
// de pé, para que qualquer falha volte ao estado anterior.
export async function updateRunner(id, onProgress = () => {}) {
  const current = docker().getContainer(id);
  const info = await current.inspect();
  const config = buildUpdateConfig(info);
  const platform = info.Config.Labels[LABEL_PLATFORM];

  const image = await ensureRunnerImage(docker(), platform, onProgress, { refresh: true });
  const latest = await docker().getImage(image).inspect();
  if (latest.Id === info.Image) {
    return {
      ...runnerFromInspect(info),
      hasStoredToken: hasStoredToken(id),
      notice: `Runner "${config.Labels[LABEL_NAME]}" is already on the latest image.`,
    };
  }

  onProgress({ type: "phase", phase: "backup", message: "Saving the runner registration…" });
  await readArchive(current, registrationMarker(platform));
  const registration = [];
  for (const source of registrationPaths(platform)) {
    registration.push({ dir: path.posix.dirname(source), data: await readArchive(current, source) });
  }

  // SIGKILL de propósito: no SIGTERM o entrypoint desregistra o runner na plataforma,
  // o que invalidaria justamente o registro que estamos preservando.
  onProgress({ type: "phase", phase: "stopping", message: "Stopping the current container…" });
  const wasRunning = Boolean(info.State?.Running);
  await ignoreStatus(current.kill(), [304, 409]);
  const backupName = `${config.name}-old-${Date.now().toString(36)}`;
  await current.rename({ name: backupName });

  let replacement = null;
  try {
    onProgress({ type: "phase", phase: "container", message: "Creating container…" });
    replacement = await docker().createContainer({ ...config, Image: image });
    for (const { dir, data } of registration) {
      await replacement.putArchive(data, { path: dir });
    }

    onProgress({ type: "phase", phase: "start", message: "Starting runner…" });
    await replacement.start();

    onProgress({ type: "phase", phase: "verify", message: "Checking that the runner stays up…" });
    await assertStaysUp(replacement);
  } catch (err) {
    onProgress({ type: "log", message: `Update failed (${err.message}); restoring the previous container…` });
    await rollbackUpdate({ replacement, current, name: config.name, wasRunning }, onProgress);
    throw err;
  }

  await current.remove({ force: true });
  const tokenKept = moveToken(id, replacement.id);
  return { ...runnerFromInspect(await replacement.inspect()), hasStoredToken: tokenKept };
}

async function readArchive(container, source) {
  let stream;
  try {
    stream = await container.getArchive({ path: source });
  } catch (err) {
    if (err.statusCode === 404) {
      const error = new Error(
        `The runner has no registration to keep (${source} not found). Use Edit to register it again.`
      );
      error.status = 409;
      throw error;
    }
    throw err;
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function assertStaysUp(container) {
  await new Promise((resolve) => setTimeout(resolve, UPDATE_HEALTH_CHECK_MS));
  const { State, RestartCount } = await container.inspect();
  if (!State?.Running || State.Restarting || RestartCount > 0) {
    throw new Error(
      `The new container did not stay up (state: ${State?.Status}, exit code: ${State?.ExitCode}).`
    );
  }
}

async function rollbackUpdate({ replacement, current, name, wasRunning }, onProgress) {
  try {
    if (replacement) await ignoreStatus(replacement.remove({ force: true }), [404]);
    await current.rename({ name });
    if (wasRunning) await current.start();
    onProgress({ type: "log", message: "The previous container was restored." });
  } catch (err) {
    // Não mascara o erro original: só registra que a volta também falhou.
    onProgress({ type: "log", message: `Could not restore the previous container: ${err.message}` });
    console.warn("runnerbox: falha ao restaurar o container após a atualização:", err.message);
  }
}

async function ignoreStatus(promise, statuses) {
  try {
    return await promise;
  } catch (err) {
    if (!statuses.includes(err.statusCode)) throw err;
    return null;
  }
}

// O token guardado é indexado pelo id do container, que muda na atualização.
function moveToken(fromId, toId) {
  try {
    const token = loadToken(fromId);
    if (!token) return false;
    saveToken(toId, token);
    deleteToken(fromId);
    return true;
  } catch (err) {
    console.warn("runnerbox: não foi possível mover o token guardado:", err.message);
    return false;
  }
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
