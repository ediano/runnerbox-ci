import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateKey, normalizeKey } from "./crypto.js";

const KEY = generateKey();

describe("normalizeKey", () => {
  it("aceita base64 e hex de 32 bytes", () => {
    expect(normalizeKey(KEY)).toHaveLength(32);
    expect(normalizeKey("a".repeat(64))).toHaveLength(32);
  });

  it("rejeita chave de tamanho errado", () => {
    expect(() => normalizeKey("curta")).toThrow(/32 bytes/);
  });

  it("rejeita chave ausente", () => {
    expect(() => normalizeKey("")).toThrow(/ausente/);
  });
});

describe("encrypt / decrypt", () => {
  it("faz o round-trip do token", () => {
    expect(decrypt(encrypt("glrt-supersecreto", KEY), KEY)).toBe("glrt-supersecreto");
  });

  it("nunca repete o ciphertext para o mesmo texto (IV aleatório)", () => {
    expect(encrypt("abc", KEY)).not.toBe(encrypt("abc", KEY));
  });

  it("não deixa o texto puro no ciphertext", () => {
    expect(Buffer.from(encrypt("TOKEN123", KEY), "base64").toString("utf8")).not.toContain(
      "TOKEN123"
    );
  });

  it("falha com a chave errada em vez de devolver lixo", () => {
    expect(() => decrypt(encrypt("abc", KEY), generateKey())).toThrow();
  });

  it("rejeita ciphertext adulterado (autenticação do GCM)", () => {
    const payload = Buffer.from(encrypt("abc", KEY), "base64");
    payload[payload.length - 1] ^= 0xff;
    expect(() => decrypt(payload.toString("base64"), KEY)).toThrow();
  });

  it("rejeita payload curto demais", () => {
    expect(() => decrypt(Buffer.alloc(10).toString("base64"), KEY)).toThrow(/inválido/);
  });
});
