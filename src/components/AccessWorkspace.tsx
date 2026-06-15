"use client";

import { useEffect, useState } from "react";
import { FileClock, Loader2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import type { AccessControlPlan } from "@/lib/access/types";

type AccessView = "users" | "roles" | "operationLog";
type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

const viewCopy: Record<AccessView, { title: string; subtitle: string; icon: typeof Users }> = {
  users: {
    title: "用户管理",
    subtitle: "后续用于维护用户资料、风险偏好、默认仓位、通知渠道和个人策略预设。",
    icon: Users
  },
  roles: {
    title: "角色权限",
    subtitle: "先固定权限边界，后续再接真实登录、用户表和接口鉴权。",
    icon: LockKeyhole
  },
  operationLog: {
    title: "操作留痕",
    subtitle: "关键操作要可追溯：谁在什么时间运行了什么策略、改了什么配置。",
    icon: FileClock
  }
};

export function AccessWorkspace({ view }: { view: AccessView }) {
  const [plan, setPlan] = useState<AccessControlPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/access/roles");
        const json = (await response.json()) as ApiResponse<AccessControlPlan>;
        if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "权限契约加载失败");
        if (mounted) setPlan(json.data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const Icon = viewCopy[view].icon;

  if (loading) {
    return (
      <section className="rounded-lg border border-line bg-panel/80 p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-info" size={28} />
        <p className="mt-3 text-sm text-muted">正在加载权限契约...</p>
      </section>
    );
  }

  if (error || !plan) {
    return (
      <section className="rounded-lg border border-warn/30 bg-warn/10 p-5 text-warn">
        <p className="font-medium">权限模块加载失败</p>
        <p className="mt-2 text-sm">{error || "未知错误"}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-info/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(15,23,42,0.78)_48%,rgba(148,163,184,0.08))] p-5">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-info/35 bg-info/10 text-info">
            <Icon size={26} />
          </span>
          <div>
            <p className="text-xs tracking-[0.18em] text-info">ACCESS CONTROL</p>
            <h2 className="mt-2 text-3xl font-semibold">{viewCopy[view].title}</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{viewCopy[view].subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="rounded-lg border border-line bg-panel/84 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h3 className="font-semibold">角色矩阵</h3>
              <p className="text-xs text-muted">这是未来接口鉴权和页面可见性的基础边界</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {plan.roles.map((role) => (
              <div key={role.id} className="rounded-lg border border-line bg-bg/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{role.name}</p>
                  <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">{role.permissions.length} 项权限</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{role.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => (
                    <span key={permission} className="rounded border border-info/20 bg-info/5 px-2 py-1 text-xs text-info">
                      {plan.permissions.find((item) => item.key === permission)?.label ?? permission}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-line bg-panel/84 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
                <LockKeyhole size={18} />
              </span>
              <h3 className="font-semibold">权限点</h3>
            </div>
            <div className="mt-4 grid gap-2">
              {plan.permissions.map((permission) => (
                <div key={permission.key} className="rounded-lg border border-line bg-bg/50 p-3">
                  <p className="text-sm font-medium">{permission.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{permission.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel/84 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
                <FileClock size={18} />
              </span>
              <h3 className="font-semibold">未来留痕事件</h3>
            </div>
            <div className="mt-4 grid gap-2">
              {plan.auditEventTypes.map((event) => (
                <div key={event.key} className="rounded-lg border border-line bg-bg/50 p-3">
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
