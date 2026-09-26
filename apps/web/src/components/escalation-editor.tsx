"use client";
import { Field } from "./ui";
import { type Data } from "@/lib/types";
export function EscalationEditor({
  value = [],
  onChange,
}: {
  value?: Data[];
  onChange: (v: Data[]) => void;
}) {
  const update = (index: number, key: string, next: any) =>
    onChange(
      value.map((row, i) => (i === index ? { ...row, [key]: next } : row)),
    );
  return (
    <details>
      <summary>Escalonamento por ocorrências ({value.length})</summary>
      <p className="muted">
        O histórico é separado por membro, regra e servidor. A etapa de maior
        contagem atingida substitui a ação inicial. Nada é aplicado enquanto a
        regra estiver desligada.
      </p>
      {value.map((row, index) => (
        <div className="repeat-row" key={index}>
          <Field label="A partir da ocorrência">
            <input
              type="number"
              min={1}
              max={100}
              value={row.count}
              onChange={(e) => update(index, "count", Number(e.target.value))}
            />
          </Field>
          <Field label="Ação">
            <select
              value={row.action}
              onChange={(e) => update(index, "action", e.target.value)}
            >
              {[
                ["warn", "Advertir"],
                ["timeout", "Timeout"],
                ["kick", "Expulsar"],
                ["ban", "Banir"],
                ["delete", "Apagar"],
                ["log", "Log"],
                ["alert", "Alerta"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {row.action === "timeout" && (
            <Field label="Minutos">
              <input
                type="number"
                min={1}
                max={40320}
                value={row.durationMinutes || 5}
                onChange={(e) =>
                  update(index, "durationMinutes", Number(e.target.value))
                }
              />
            </Field>
          )}
          <button
            type="button"
            className="button secondary small"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remover etapa
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary small"
        disabled={value.length >= 10}
        onClick={() =>
          onChange([
            ...value,
            {
              count: Math.min(100, (value.at(-1)?.count || 1) + 1),
              action: "log",
            },
          ])
        }
      >
        Adicionar etapa
      </button>
    </details>
  );
}
