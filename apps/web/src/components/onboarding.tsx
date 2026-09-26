"use client";
import { ModuleDetails } from "./module-details";
import { useState } from "react";
import { moduleNames, type GuildContext, type Data } from "@/lib/types";
import { write, errorText } from "@/lib/api";
import { Panel, Toggle, Confirm, ErrorBox, ChannelSelect } from "./ui";
export function Onboarding({
  context,
  guildId,
  save,
  done,
}: {
  context: GuildContext;
  guildId: string;
  save: (data: Data) => Promise<void>;
  done: () => void;
}) {
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState(() => structuredClone(context.config)),
    [skip, setSkip] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function finish(skipped = false) {
    setSkip(false);
    setBusy(true);
    setError("");
    try {
      if (!skipped) await save(draft);
      await write(`/guilds/${guildId}/onboarding`, "POST", { skipped });
      done();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const steps = [
    "Bem-vindo ao Kagetsu",
    "Escolha os módulos",
    "Permissões necessárias",
    "Configurações essenciais",
    "Finalizar",
  ];
  return (
    <main className="public-main">
      <Panel
        title={steps[step]}
        description={`Passo ${step + 1} de 5 · ${context.guild.name}`}
      >
        {error && <ErrorBox message={error} />}
        {step === 0 && (
          <p>
            Escolha como o Kagetsu vai ajudar sua comunidade. Você poderá
            alterar tudo em Gerenciar módulos.
          </p>
        )}
        {step === 1 && (
          <div className="module-grid">
            {Object.entries(moduleNames).map(([id, name]) => (
              <div className="module-card" key={id}>
                <Toggle
                  key={id}
                  label={name}
                  value={draft.modules[id] === true}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      modules: { ...draft.modules, [id]: value },
                    })
                  }
                />
                <ModuleDetails id={id} />
              </div>
            ))}
          </div>
        )}
        {step === 2 && (
          <>
            <p>
              O Kagetsu usa permissões específicas. Administrator não é
              necessário.
            </p>
            <p>
              {context.permissions.unavailable
                ? "Dados do Discord indisponíveis; você poderá verificar novamente no dashboard."
                : context.permissions.missing.length
                  ? `Ajuste: ${context.permissions.missing.join(", ")}`
                  : "Permissões verificadas."}
            </p>
            <p>
              Tickets precisam de Gerenciar Canais e Gerenciar Cargos. Cargos
              gerenciados devem ficar abaixo do cargo do bot.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <label>
              Prefixo
              <input
                value={draft.general.prefix}
                maxLength={10}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    general: { ...draft.general, prefix: e.target.value },
                  })
                }
              />
            </label>
            {draft.modules.welcome && (
              <ChannelSelect
                channels={context.channels}
                value={draft.welcome.channelId}
                onChange={(channelId) =>
                  setDraft({
                    ...draft,
                    welcome: { ...draft.welcome, channelId },
                  })
                }
              />
            )}
          </>
        )}
        {step === 4 && (
          <p>
            {Object.entries(moduleNames)
              .filter(([id]) => draft.modules[id])
              .map(([, name]) => name)
              .join(" · ") || "Nenhum módulo selecionado."}{" "}
            As configurações e o XP existentes serão preservados.
          </p>
        )}
        <div className="form-actions">
          {step > 0 && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Voltar
            </button>
          )}
          {step < 4 ? (
            <button
              className="button primary"
              onClick={() => setStep(step + 1)}
            >
              Continuar
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void finish()}
            >
              Finalizar
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setSkip(true)}
          >
            Pular configuração
          </button>
        </div>
      </Panel>
      {skip && (
        <Confirm
          title="Pular configuração?"
          description="As configurações atuais serão mantidas. Você poderá configurar os módulos depois."
          onConfirm={() => void finish(true)}
          onClose={() => setSkip(false)}
        />
      )}
    </main>
  );
}
