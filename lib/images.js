// Constrói as imagens dos runners a partir dos contextos versionados neste repo.
// O painel não depende de nenhuma imagem de terceiros publicada em registry: os
// motores são nossos, montados sobre a base oficial de cada fornecedor.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { githubImage, gitlabImage } from "./constants.js";

// Arquivos que entram no build. São também a entrada do hash da tag.
const CONTEXT_FILES = ["Dockerfile", "entrypoint.sh"];

const IMAGE_ENV = {
  github: "RUNNERBOX_GITHUB_IMAGE",
  gitlab: "RUNNERBOX_GITLAB_IMAGE",
};

export function buildContextDir(platform) {
  const root = process.env.RUNNERBOX_BUILD_CONTEXT_DIR || path.join(process.cwd(), "docker");
  return path.join(root, `${platform}-runner`);
}

// A imagem só é construída quando a tag não existe no host. Com uma tag fixa, mudar o
// Dockerfile não teria efeito em quem já tem a imagem antiga; derivando a tag do
// conteúdo do contexto, qualquer mudança gera uma tag nova e força o rebuild.
function contextHash(platform) {
  const context = buildContextDir(platform);
  const hash = crypto.createHash("sha256");
  for (const file of CONTEXT_FILES) {
    const full = path.join(context, file);
    if (!fs.existsSync(full)) return null;
    hash.update(file).update("\0").update(fs.readFileSync(full)).update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

export function imageFor(platform) {
  const image = platform === "github" ? githubImage() : gitlabImage();
  // Imagem definida explicitamente pelo usuário: ele assume o controle da tag.
  if (process.env[IMAGE_ENV[platform]]) return image;

  const hash = contextHash(platform);
  return hash ? image.replace(/:[^:/]+$/, `:${hash}`) : image;
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
    { context, src: CONTEXT_FILES },
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
