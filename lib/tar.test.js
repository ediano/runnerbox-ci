import { describe, expect, it } from "vitest";
import { createTar } from "./tar.js";

describe("createTar", () => {
  const tar = createTar([{ name: "token", content: "glrt-abc123", mode: 0o600 }]);

  it("produz blocos de 512 bytes", () => {
    expect(tar.length % 512).toBe(0);
  });

  it("grava o nome e a marca ustar no header", () => {
    expect(tar.subarray(0, 5).toString()).toBe("token");
    expect(tar.subarray(257, 262).toString()).toBe("ustar");
  });

  it("grava tamanho e modo em octal", () => {
    expect(tar.subarray(124, 135).toString()).toBe("00000000013"); // 11 bytes
    expect(tar.subarray(100, 107).toString()).toBe("0000600");
  });

  it("calcula um checksum que confere com o header", () => {
    const stored = parseInt(tar.subarray(148, 154).toString(), 8);
    const header = Buffer.from(tar.subarray(0, 512));
    header.write("        ", 148, 8, "utf8");
    expect(header.reduce((sum, byte) => sum + byte, 0)).toBe(stored);
  });

  it("escreve o conteúdo logo após o header", () => {
    expect(tar.subarray(512, 523).toString()).toBe("glrt-abc123");
  });

  it("termina com dois blocos zerados", () => {
    expect(tar.subarray(tar.length - 1024).every((byte) => byte === 0)).toBe(true);
  });
});
