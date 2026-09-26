"use client";
import { useEffect, useState, useCallback } from "react";
import { api, errorText } from "@/lib/api";
import { Panel, ErrorBox, Spinner, useRetrySeconds } from "./ui";
import { type Data } from "@/lib/types";
export function Diagnostics({ guildId }: { guildId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRetrySeconds();
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api(`/guilds/${guildId}/diagnostics`, { cache: "reload" }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [guildId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Panel title="Status do Kagetsu">
      <button
        className="button secondary"
        disabled={busy || retry > 0}
        onClick={() => void load()}
      >
        {retry ? `Aguarde ${retry}s` : "Verificar configuração"}
      </button>
      {busy && <Spinner />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <p>
            API: online · Banco: conectado · Bot:{" "}
            {data.bot?.online ? "online" : "offline"}
          </p>
          <p>
            Última heartbeat: {data.bot?.last_seen || "Sem heartbeat"} ·
            Latência: {data.bot?.latency_ms ?? "—"} ms
          </p>
          <p>
            Último sync: {data.sync?.synced_at || "Pendente"} ·{" "}
            {data.sync?.command_count ?? "—"} comandos
          </p>
          <h3>Configuração</h3>
          {data.problems.length ? (
            <ul>
              {data.problems.map((p: string) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p>Nenhum problema detectado nos dados disponíveis.</p>
          )}
          <h3>Últimos jobs com erro</h3>
          {data.jobs.length ? (
            <ul>
              {data.jobs.map((j: Data) => (
                <li key={j.id}>
                  {j.action} · {j.status} · {j.error}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum erro recente.</p>
          )}
        </>
      )}
    </Panel>
  );
}
