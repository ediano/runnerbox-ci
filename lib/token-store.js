// Guarda os tokens cifrados em um arquivo local, para que "Editar" não exija
// redigitar a credencial. Não é um banco: é um JSON 0600 indexado por container id.
import fs from "node:fs";
import path from "node:path";
import { decrypt, encrypt, generateKey } from "./crypto.js";

const DEFAULT_DATA_DIR = process.env.RUNNERBOX_DATA_DIR || "/var/lib/runnerbox";

function dataDir() {
  return process.env.RUNNERBOX_DATA_DIR || DEFAULT_DATA_DIR;
}

function storePath() {
  return path.join(dataDir(), "tokens.json");
}

function keyPath() {
  return path.join(dataDir(), "key");
}

// A chave vem do ambiente quando o operador a gerencia; senão geramos uma e a
// persistimos com 0600, para que os tokens sobrevivam a um restart do painel.
function loadKey() {
  if (process.env.RUNNERBOX_SECRET_KEY) return process.env.RUNNERBOX_SECRET_KEY;

  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  try {
    return fs.readFileSync(keyPath(), "utf8").trim();
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const key = generateKey();
  fs.writeFileSync(keyPath(), key, { mode: 0o600 });
  return key;
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeAll(entries) {
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(storePath(), JSON.stringify(entries, null, 2), { mode: 0o600 });
}

export function saveToken(containerId, token) {
  const entries = readAll();
  entries[containerId] = { token: encrypt(token, loadKey()), updatedAt: new Date().toISOString() };
  writeAll(entries);
}

export function loadToken(containerId) {
  const entry = readAll()[containerId];
  if (!entry) return null;
  try {
    return decrypt(entry.token, loadKey());
  } catch {
    // Chave trocada ou arquivo adulterado: tratamos como ausente e pedimos o token
    // de novo, em vez de derrubar a listagem inteira.
    return null;
  }
}

export function deleteToken(containerId) {
  const entries = readAll();
  if (!(containerId in entries)) return;
  delete entries[containerId];
  writeAll(entries);
}

// Um runner removido por fora do painel deixaria o token órfão em disco.
export function pruneTokens(activeIds) {
  const entries = readAll();
  const keep = new Set(activeIds);
  let changed = false;
  for (const id of Object.keys(entries)) {
    if (!keep.has(id)) {
      delete entries[id];
      changed = true;
    }
  }
  if (changed) writeAll(entries);
}
