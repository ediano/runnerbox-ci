// Constrói as imagens dos runners a partir dos contextos versionados neste repo.
// O painel não depende de nenhuma imagem de terceiros publicada em registry: os
// motores são nossos, montados sobre a base oficial de cada fornecedor.
import fs from "node:fs";
import path from "node:path";
import { githubImage, gitlabImage } from "./constants.js";

export function buildContextDir(platform) {
  const root = process.env.RUNNERBOX_BUILD_CONTEXT_DIR || path.join(process.cwd(), "docker");
  return path.join(root, `${platform}-runner`);
}

export function imageFor(platform) {
  return platform === "github" ? githubImage() : gitlabImage();
}

export async function ensureRunnerImage(docker, platform, onProgress = () => {}) {
  const image = imageFor(platform);

  try {
    await docker.getImage(image).inspect();
    onProgress({ type: "phase", phase: "image", message: `Image ${image} is already available.` });
    return image;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  const context = buildContextDir(platform);
  if (!fs.existsSync(path.join(context, "Dockerfile"))) {
    throw new Error(
      `Image ${image} is not available locally and no build context was found at ${context}.`
    );
  }

  onProgress({ type: "phase", phase: "image", message: `Building image ${image}…` });
  const stream = await docker.buildImage(
    { context, src: ["Dockerfile", "entrypoint.sh"] },
    { t: image, pull: "true" }
  );

  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, output) => {
        if (err) return reject(err);
        // O build stream devolve HTTP 200 mesmo quando um passo falha; o erro só
        // aparece como um evento `error` no meio da saída.
        const failure = output?.find((event) => event.error);
        if (failure) return reject(new Error(failure.error));
        resolve();
      },
      // O stream de build mistura duas coisas: as linhas de saída do build
      // (`stream`) e os eventos do pull da imagem base que `pull: "true"` dispara
      // (`status` + `id` da camada). O painel precisa das duas para mostrar
      // progresso em vez de uma tela parada.
      (event) => {
        if (event.stream?.trim()) {
          onProgress({ type: "log", message: event.stream.trim() });
          return;
        }
        if (event.status && event.id) {
          onProgress({
            type: "pull",
            layer: event.id,
            status: event.status,
            current: event.progressDetail?.current,
            total: event.progressDetail?.total,
          });
        }
      }
    );
  });

  return image;
}
