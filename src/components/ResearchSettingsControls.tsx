"use client";

import type { ElementType, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

export function SettingsPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"rounded-lg border border-line bg-panel/88 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.22)] " + className}>{children}</div>;
}

export function SettingsSectionTitle({ icon: Icon, title, meta }: { icon: ElementType; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}

export function SettingsMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel/70 p-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function SettingsReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-all font-mono text-sm">{value || "-"}</p>
    </div>
  );
}

export function SettingsTextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-sm outline-none"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SettingsSecretInput({
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  disabled = false,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex rounded-lg border border-line bg-bg/60 focus-within:border-info/60">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none disabled:cursor-not-allowed disabled:text-muted"
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="flex w-10 items-center justify-center text-muted transition hover:text-info disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onToggleVisible}
          disabled={disabled && !value}
          aria-label={visible ? "隐藏密钥" : "显示密钥"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}
