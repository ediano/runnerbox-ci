// Gerador mínimo de tar (formato USTAR). Existe porque `putArchive` do Docker só
// aceita tar, e entregar o token por arquivo — em vez de env var — é o que o mantém
// fora do `docker inspect`. Escrever ~40 linhas evita depender de um pacote extra.
const BLOCK_SIZE = 512;

function writeString(buffer, value, offset, length) {
  buffer.write(value.slice(0, length - 1), offset, length - 1, "utf8");
}

function writeOctal(buffer, value, offset, length) {
  // Campos numéricos do USTAR são octal ASCII terminado em NUL.
  writeString(buffer, value.toString(8).padStart(length - 1, "0"), offset, length);
}

export function createTar(files) {
  const chunks = [];

  for (const file of files) {
    const content = Buffer.from(file.content, "utf8");
    const header = Buffer.alloc(BLOCK_SIZE);

    writeString(header, file.name, 0, 100);
    writeOctal(header, file.mode ?? 0o600, 100, 8);
    writeOctal(header, 0, 108, 8); // uid
    writeOctal(header, 0, 116, 8); // gid
    writeOctal(header, content.length, 124, 12);
    writeOctal(header, file.mtime ?? Math.floor(Date.now() / 1000), 136, 12);
    header.write("        ", 148, 8, "utf8"); // checksum em branco durante o cálculo
    header.write("0", 156, 1, "utf8"); // typeflag: arquivo comum
    header.write("ustar\0", 257, 6, "utf8");
    header.write("00", 263, 2, "utf8");

    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");

    chunks.push(header, content);

    const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding));
  }

  // Duas blocos zerados marcam o fim do arquivo tar.
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return Buffer.concat(chunks);
}
