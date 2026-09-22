// Leitor do stream NDJSON das rotas de criação/recriação. Vive em lib/ (e não em um
// componente) para poder ser testado sem React nem rede.

// Um chunk do `fetch` não respeita fronteiras de linha: a última linha costuma vir
// partida no meio. Por isso o resto fica no buffer até o próximo `\n`.
export function createNdjsonParser(onEvent) {
  let buffer = "";

  const flushLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed));
    } catch {
      // Linha corrompida não pode derrubar o resto do stream.
    }
  };

  return {
    push(text) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(flushLine);
    },
    end() {
      flushLine(buffer);
      buffer = "";
    },
  };
}

export async function readNdjsonStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser(onEvent);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    reader.releaseLock();
  }
}
