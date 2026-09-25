import Link from "next/link";
import { Brand } from "@/components/ui";
export default function NotFound() {
  return (
    <main className="full-screen">
      <Brand />
      <div className="login-required">
        <h1>Este caminho ainda não existe.</h1>
        <p>Volte aos seus servidores para continuar.</p>
        <Link className="button primary" href="/guilds">
          Meus servidores
        </Link>
      </div>
    </main>
  );
}
