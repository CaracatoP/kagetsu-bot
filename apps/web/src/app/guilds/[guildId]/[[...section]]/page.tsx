"use client";
import { useParams } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
export default function GuildPage() {
  const params = useParams<{ guildId: string; section?: string[] }>();
  return (
    <Dashboard
      key={params.guildId}
      guildId={params.guildId}
      sectionId={params.section?.[0] || "overview"}
    />
  );
}
