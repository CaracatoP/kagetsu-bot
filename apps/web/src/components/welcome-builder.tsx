"use client";
import { useState } from "react";
import { type Data, type GuildContext } from "@/lib/types";
import { safeImage } from "@/lib/api";
import { Field, Panel, ChannelSelect, Toggle } from "./ui";
import {
  PLACEHOLDERS,
  renderTemplate,
} from "../../../../packages/shared/welcome";
export function WelcomeBuilder({
  value,
  context,
  onChange,
}: {
  value: Data;
  context: GuildContext;
  onChange: (data: Data) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const designKey = leaving ? "leaveDesign" : "design",
    messageKey = leaving ? "leaveMessage" : "message",
    typeKey = leaving ? "leaveType" : "type",
    channelKey = leaving ? "leaveChannelId" : "channelId";
  const design = value[designKey] || {},
    format = value[typeKey] || "text";
  const set = (key: string, v: any) => onChange({ ...value, [key]: v });
  const setDesign = (key: string, v: any) =>
    set(designKey, { ...design, [key]: v });
  const sample = {
    user: "@Visitante",
    username: "visitante",
    displayName: "Visitante",
    server: context.guild.name,
    memberCount: context.guild.memberCount || 42,
    userId: "123456789012345678",
  };
  const render = (text: string) => renderTemplate(text, sample);
  return (
    <>
      <div className="form-actions">
        <button
          type="button"
          className={`button ${!leaving ? "primary" : "secondary"}`}
          onClick={() => setLeaving(false)}
        >
          Boas-vindas
        </button>
        <button
          type="button"
          className={`button ${leaving ? "primary" : "secondary"}`}
          onClick={() => setLeaving(true)}
        >
          Saída
        </button>
      </div>
      <div className="two-columns">
        <Panel
          title="Editor de mensagem"
          description="A prévia é local. Digitar não consulta o Discord."
        >
          <ChannelSelect
            channels={context.channels}
            value={value[channelKey]}
            onChange={(v) => set(channelKey, v)}
          />
          <Field label="Formato">
            <select
              value={format}
              onChange={(e) => set(typeKey, e.target.value)}
            >
              {[
                ["text", "Mensagem"],
                ["embed", "Embed"],
                ["card", "Card"],
                ["mixed", "Mensagem + embed"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conteúdo">
            <textarea
              rows={3}
              maxLength={2000}
              value={value[messageKey]}
              onChange={(e) => set(messageKey, e.target.value)}
            />
          </Field>
          {format !== "text" && (
            <>
              {[
                ["title", "Título"],
                ["description", "Descrição"],
                ["footer", "Rodapé"],
                ["thumbnailUrl", "Thumbnail HTTPS"],
                ["imageUrl", "Imagem / banner HTTPS"],
                ["backgroundUrl", "Background do card HTTPS"],
              ].map(([id, label]) => (
                <Field label={label} key={id}>
                  <input
                    value={design[id] || ""}
                    maxLength={
                      id === "title" ? 256 : id === "footer" ? 500 : 2000
                    }
                    onChange={(e) => setDesign(id, e.target.value)}
                  />
                </Field>
              ))}
              <Field label="Cor">
                <input
                  type="color"
                  value={design.color || "#b49aff"}
                  onChange={(e) => setDesign("color", e.target.value)}
                />
              </Field>
              <Toggle
                label="Mostrar avatar"
                value={design.showAvatar !== false}
                onChange={(v) => setDesign("showAvatar", v)}
              />
              <Toggle
                label="Mostrar nome"
                value={design.showName !== false}
                onChange={(v) => setDesign("showName", v)}
              />
              <Field label="Escurecer background">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={design.overlay ?? 0.25}
                  onChange={(e) => setDesign("overlay", Number(e.target.value))}
                />
              </Field>
            </>
          )}
          {!leaving && (
            <Field label="Mensagem privada opcional">
              <textarea
                value={value.dmMessage || ""}
                maxLength={2000}
                onChange={(e) => set("dmMessage", e.target.value)}
              />
            </Field>
          )}
          <p className="muted">
            Placeholders: {PLACEHOLDERS.map((p) => `{${p}}`).join(" · ")}
          </p>
          <p className="muted">
            Imagens: HTTPS do CDN Discord ou Unsplash. GIF é enviado diretamente
            em embeds; cards são PNG.
          </p>
        </Panel>
        <Panel
          title={leaving ? "Prévia de saída" : "Prévia de boas-vindas"}
          description={
            format === "card"
              ? "Simulação do conteúdo e cores; o bot renderiza o PNG com a fonte Kagetsu."
              : "Exemplo com um visitante fictício."
          }
        >
          {(format === "text" || format === "mixed") && (
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {render(value[messageKey])}
            </p>
          )}
          {format !== "text" && (
            <div
              style={{
                borderLeft: `4px solid ${design.color || "#b49aff"}`,
                padding: 20,
                borderRadius: 12,
                background: "#151827",
                overflowWrap: "anywhere",
              }}
            >
              {format === "card" && design.showAvatar !== false && (
                <div className="user-avatar">V</div>
              )}
              {format === "card" && design.showName !== false && (
                <h3>Visitante</h3>
              )}
              {safeImage(design.thumbnailUrl) && (
                <img
                  src={design.thumbnailUrl}
                  alt="Thumbnail"
                  style={{ width: 64, float: "right" }}
                />
              )}
              <h3>{render(design.title || context.guild.name)}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {render(design.description || value[messageKey])}
              </p>
              {safeImage(
                format === "card" ? design.backgroundUrl : design.imageUrl,
              ) && (
                <img
                  src={
                    format === "card" ? design.backgroundUrl : design.imageUrl
                  }
                  alt="Imagem configurada"
                  style={{ maxWidth: "100%", borderRadius: 8 }}
                />
              )}
              <small>{render(design.footer)}</small>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
