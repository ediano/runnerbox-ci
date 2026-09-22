// Única camada que fala com o daemon do Docker. Tudo que for decisão de configuração
// mora em runner-spec.js; aqui só há chamadas de I/O.
import Docker from "dockerode";
import { DOCKER_SOCKET, LABEL_MANAGED } from "./constants.js";
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
  return containers
    .map(containerToRunner)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function ensureImage(image) {
  try {
    await docker().getImage(image).inspect();
    return;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  const stream = await docker().pull(image);
  await new Promise((resolve, reject) => {
    docker().modem.followProgress(stream, (err) => (err ? reject(err) : resolve()));
  });
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

export async function createRunner(input) {
  assertValid(input);

  const config = buildContainerConfig(input);
  await ensureImage(config.Image);

  const container = await docker().createContainer(config);
  await container.start();

  const info = await container.inspect();
  return containerToRunner({
    Id: info.Id,
    Names: [info.Name],
    State: info.State?.Status,
    Status: info.State?.Status,
    Image: info.Config?.Image,
    Labels: info.Config?.Labels,
  });
}

// Estratégia recreate da spec §3C: as credenciais do runner são variáveis de ambiente
// de registro, então não há como alterá-las sem destruir e recriar o container.
export async function recreateRunner(id, input) {
  // Valida antes de destruir: um payload inválido não pode custar o runner existente.
  assertValid(input);
  await docker().getContainer(id).remove({ force: true });
  return createRunner(input);
}

export async function removeRunner(id) {
  const container = docker().getContainer(id);
  try {
    await container.stop({ t: 10 });
  } catch (err) {
    // 304 = já parado; 404 = já removido por fora do painel. Ambos são sucesso aqui.
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }
  await container.remove({ force: true });
}
