import "./globals.css";

export const metadata = {
  title: "Runner Box CI",
  description: "Local panel to manage GitHub Actions and GitLab CI runners",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
