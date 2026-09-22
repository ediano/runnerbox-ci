// AES-256-GCM para o token em repouso. GCM (e não CBC) porque autentica o
// ciphertext: um arquivo de tokens adulterado falha na decifragem em vez de
// devolver lixo silenciosamente.
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString("base64");
}

export function normalizeKey(rawKey) {
  if (!rawKey) throw new Error("Chave de criptografia ausente.");
  const trimmed = String(rawKey).trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("A chave deve ter 32 bytes (64 caracteres hex ou 44 em base64).");
  }
  return key;
}

export function encrypt(plaintext, rawKey) {
  const key = normalizeKey(rawKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(payload, rawKey) {
  const key = normalizeKey(rawKey);
  const buffer = Buffer.from(String(payload), "base64");
  if (buffer.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Payload cifrado inválido.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, buffer.subarray(0, IV_LENGTH));
  decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([
    decipher.update(buffer.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
}
