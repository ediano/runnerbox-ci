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
    return image;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  const context = buildContextDir(platform);
  if (!fs.existsSync(path.join(context, "Dockerfile"))) {
    throw new Error(
      `A imagem ${image} não existe localmente e o contexto de build não foi encontrado em ${context}.`
    );
  }

  onProgress(`Construindo a imagem ${image}…`);
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
      (event) => {
        if (event.stream?.trim()) onProgress(event.stream.trim());
      }
    );
  });

  return image;
}
