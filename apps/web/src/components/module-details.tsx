import { moduleDetails } from "../../../../packages/shared/moduleInfo";
export function ModuleDetails({ id }: { id: string }) {
  const info = moduleDetails(id);
  return (
    <div className="muted">
      <p>{info.description}</p>
      <small>
        Dependências: {info.dependencies.join(", ") || "nenhuma"}
        <br />
        Permissões conforme ações:{" "}
        {info.permissions.join(", ") || "nenhuma adicional"}
      </small>
    </div>
  );
}
