export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 text-sm text-slate-500">
        <p>
          <strong className="font-medium text-slate-700">RunnerBox CI</strong> — criado por
          Ediano Silva Santos. Distribuído sob a licença do repositório.
        </p>
        <p className="mt-1">
          Uso local: o painel não possui autenticação e controla o Docker da máquina host.
        </p>
      </div>
    </footer>
  );
}
