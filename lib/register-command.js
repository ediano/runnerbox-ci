// Extrai URL e token do comando de registro que as plataformas mostram prontos para
// copiar (`./config.sh --url … --token …` no GitHub, `gitlab-runner register …` no
// GitLab), para que colar o comando inteiro preencha o formulário.

const URL_FLAGS = ["--url"];
const TOKEN_FLAGS = ["--token", "--registration-token"];
const NAME_FLAGS = ["--name"];

// Separa por espaço respeitando aspas. Continuações de linha (`\` no bash, `` ` `` no
// PowerShell) viram espaço antes, pois o comando às vezes chega quebrado em linhas.
function tokenize(text) {
  const source = text.replace(/[\\`]\r?\n/g, " ");
  const tokens = [];
  let current = "";
  let quote = null;
  let inToken = false;

  for (const char of source) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inToken = true;
    } else if (/\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
    } else {
      current += char;
      inToken = true;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

// Aceita tanto `--flag valor` quanto `--flag=valor`.
function flagValue(tokens, flags) {
  for (let i = 0; i < tokens.length; i++) {
    const [flag, inline] = splitInline(tokens[i]);
    if (!flags.includes(flag)) continue;
    const value = inline ?? tokens[i + 1];
    if (value && !value.startsWith("--")) return value;
  }
  return null;
}

function splitInline(token) {
  const index = token.indexOf("=");
  return index === -1 ? [token, null] : [token.slice(0, index), token.slice(index + 1)];
}

// Sem URL e token juntos não é um comando de registro: devolve null e a colagem segue
// normal, então colar só uma URL ou só um token continua funcionando.
export function parseRegisterCommand(text) {
  if (typeof text !== "string" || !text.includes("--")) return null;
  const tokens = tokenize(text.trim());
  const url = flagValue(tokens, URL_FLAGS);
  const token = flagValue(tokens, TOKEN_FLAGS);
  if (!url || !token) return null;
  return { url, token, name: flagValue(tokens, NAME_FLAGS) };
}
