/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // dockerode carrega dependências nativas/opcionais (ssh2, cpu-features) que o
    // bundler não consegue empacotar; mantê-lo externo faz o require acontecer em runtime.
    serverComponentsExternalPackages: ["dockerode"],
  },
};

module.exports = nextConfig;
