import "./globals.css";

export const metadata = {
  title: "Runner Box CI",
  description: "Painel local para gestão de runners GitHub Actions e GitLab CI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
