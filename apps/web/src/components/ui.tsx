"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Moon,
  Plus,
  X,
} from "lucide-react";
import {
  subscribeDiscord,
  getRetryDeadline,
  getDiscordWarning,
  clearDiscordWarning,
  api,
  errorText,
  setCsrf,
  write,
} from "@/lib/api";
import type { Channel, Role, User } from "@/lib/types";

type Session = {
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};
const SessionContext = createContext<Session>(null!);
export const useSession = () => useContext(SessionContext);
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const session = await api("/auth/me");
      setUser({
        ...session.user,
        global_name: session.user.globalName || session.user.global_name,
      });
      setCsrf(session.csrfToken);
    } catch (err: any) {
      setUser(null);
      if (err.status !== 401) setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function logout() {
    try {
      await write("/auth/logout", "POST");
      setUser(null);
      setCsrf("");
      router.push("/");
    } catch (err) {
      setToast({ message: errorText(err), error: true });
    }
  }
  return (
    <SessionContext.Provider
      value={{
        user,
        loading,
        error,
        refresh,
        logout,
        notify: (message, error) => setToast({ message, error }),
      }}
    >
      <DiscordNotice />
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            aria-label="Fechar notificação"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </SessionContext.Provider>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark">
        <Moon size={23} fill="currentColor" />
      </span>
      {!compact && (
        <span>
          Kagetsu<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>{label}</span>
    </div>
  );
}
export function useRetrySeconds() {
  const deadline = useSyncExternalStore(
    subscribeDiscord,
    getRetryDeadline,
    () => 0,
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
function DiscordNotice() {
  const message = useSyncExternalStore(
    subscribeDiscord,
    getDiscordWarning,
    () => "",
  );
  return message ? (
    <div
      className="notice"
      style={{
        position: "fixed",
        top: 80,
        right: 24,
        maxWidth: "min(440px, 90vw)",
        zIndex: 100,
        background: "#242033",
      }}
      role="status"
    >
      <span>Dados salvos preservados. {message}</span>
      <button
        aria-label="Fechar aviso do Discord"
        onClick={clearDiscordWarning}
      >
        <X size={16} />
      </button>
    </div>
  ) : null;
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const retrySeconds = useRetrySeconds();
  return (
    <div className="notice danger" role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>Não foi possível concluir</strong>
        <p>{message}</p>
        {retrySeconds > 0 && <p>Tente novamente em {retrySeconds} segundos.</p>}
        {retry && retrySeconds === 0 && (
          <button className="button secondary small" onClick={retry}>
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  icon = <Moon size={28} />,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
export function Toggle({
  value,
  onChange,
  label,
  description,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={!!value}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className={`switch ${value ? "on" : ""}`} aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="button secondary small"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus size={15} />
      {children}
    </button>
  );
}
export function ChannelSelect({
  channels,
  value,
  onChange,
  types = [0, 5],
  required = false,
  label = "Canal",
  hint,
}: {
  channels: Channel[];
  value?: string;
  onChange: (v: string) => void;
  types?: number[];
  required?: boolean;
  label?: string;
  hint?: string;
}) {
  const choices = channels.filter((channel) => types.includes(channel.type));
  const missing = value && !choices.some((channel) => channel.id === value);
  return (
    <Field
      label={label}
      hint={
        missing
          ? "Este canal foi removido ou não está disponível. Selecione outro."
          : hint
      }
    >
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">
          {required ? "Selecione um canal" : "Não configurado"}
        </option>
        {missing && <option value={value}>⚠ Canal indisponível</option>}
        {choices.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.type === 4 ? "" : "# "}
            {channel.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function RoleSelect({
  roles,
  value,
  onChange,
  label = "Cargo",
  required = false,
  safe = true,
}: {
  roles: Role[];
  value?: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  safe?: boolean;
}) {
  const missing = value && !roles.some((role) => role.id === value);
  const selected = roles.find((role) => role.id === value);
  const unsafe =
    safe && selected && (!selected.manageable || selected.dangerous);
  return (
    <Field
      label={label}
      hint={
        missing
          ? "Cargo removido no Discord. Selecione outro."
          : unsafe
            ? "Kagetsu não pode atribuir este cargo. Selecione um cargo seguro abaixo do bot."
            : undefined
      }
    >
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">{required ? "Selecione um cargo" : "Nenhum"}</option>
        {missing && <option value={value}>⚠ Cargo removido</option>}
        {roles.map((role) => (
          <option
            key={role.id}
            value={role.id}
            disabled={safe && (!role.manageable || role.dangerous)}
          >
            @{role.name}
            {safe && (!role.manageable || role.dangerous)
              ? " · indisponível"
              : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function MultiSelect({
  label,
  items,
  values = [],
  onChange,
  hint,
}: {
  label: string;
  items: { id: string; name: string; disabled?: boolean }[];
  values: string[];
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  const unknown = values.filter((v) => !items.some((item) => item.id === v));
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="check-list">
        {items.length === 0 && (
          <span className="muted">Nenhuma opção disponível.</span>
        )}
        {items.map((item) => (
          <label key={item.id} className="check-item">
            <input
              type="checkbox"
              disabled={item.disabled && !values.includes(item.id)}
              checked={values.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...values, item.id]
                    : values.filter((v) => v !== item.id),
                )
              }
            />
            <span>{item.name}</span>
            {item.disabled && <small>indisponível</small>}
          </label>
        ))}
        {unknown.map((id) => (
          <label className="check-item" key={id}>
            <input
              type="checkbox"
              checked
              onChange={() => onChange(values.filter((v) => v !== id))}
            />
            ⚠ Item removido no Discord
          </label>
        ))}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
export function Confirm({
  title,
  description,
  confirm = "Confirmar",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirm?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="empty-icon">
          <AlertTriangle />
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="actions">
          <button className="button secondary" onClick={onClose} autoFocus>
            Cancelar
          </button>
          <button
            className={`button ${danger ? "danger-button" : "primary"}`}
            onClick={onConfirm}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
