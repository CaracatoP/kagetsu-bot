"use client";
import { Brand, ErrorBox } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="full-screen">
      <Brand />
      <ErrorBox
        message="Não foi possível abrir esta página. Suas configurações salvas continuam preservadas."
        retry={reset}
      />
    </main>
  );
}
