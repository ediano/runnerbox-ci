import "./globals.css";

export const metadata = {
  title: "Runner Box CI",
  description: "Painel local para gestão de runners GitHub Actions e GitLab CI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
