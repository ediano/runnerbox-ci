import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

export const metadata = {
  title: "Runner Box CI",
  description: "Local panel to manage GitHub Actions and GitLab CI runners",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
