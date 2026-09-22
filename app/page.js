import Dashboard from "./components/Dashboard";
import Header from "./components/Header";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
}
