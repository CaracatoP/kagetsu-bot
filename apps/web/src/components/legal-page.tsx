import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/ui";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <Link className="button secondary small" href="/">
          Voltar ao início
        </Link>
      </header>
      <main className="public-main legal-main">
        <div className="eyebrow">KAGETSU · INFORMAÇÕES LEGAIS</div>
        <h1>{title}</h1>
        <section className="legal-content" aria-label={title}>
          {children}
        </section>
      </main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} Kagetsu</span>
        <nav className="legal-links" aria-label="Documentos legais">
          <Link href="/termos-de-servico">Termos de Serviço</Link>
          <Link href="/politica-de-privacidade">Política de Privacidade</Link>
        </nav>
        <Link className="footer-moon" href="/">
          Voltar ao Kagetsu
        </Link>
      </footer>
    </div>
  );
}
