import type { Metadata } from "next";
import { Providers } from "@/components/ui";
import "./globals.css";
export const metadata: Metadata = {
  title: "Kagetsu — Sua comunidade, do seu jeito",
  description:
    "Uma central para configurar e cuidar da sua comunidade no Discord.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
