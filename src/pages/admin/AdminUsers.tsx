import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAllProfessionals, useSupportUsers, useRemoveSupportRole, useIsAdmin } from "@/hooks/useAdmin";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search, Users, Loader2, Ban, UserCheck, Globe, MessageCircle,
  BarChart3, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Eye, Shield, Trash2, LogIn,
} from "lucide-react";
import AdminCreateProfessional from "@/components/admin/AdminCreateProfessional";
import AdminCreateSupport from "@/components/admin/AdminCreateSupport";

const AdminUsers = () => {
  const { data: professionals, isLoading } = useAllProfessionals();
  const { data: supportUsers, isLoading: loadingSupport } = useSupportUsers();
  const { data: isAdmin } = useIsAdmin();
  const removeSupportRole = useRemoveSupportRole();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateSupport, setShowCreateSupport] = useState(false);
  const qc = useQueryClient();

  const supportUserIds = new Set((supportUsers || []).map((s: any) => s.user_id));

  const filtered = (professionals || []).filter((p) =>
    !supportUserIds.has(p.user_id) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.business_name || "").toLowerCase().includes(search.toLowerCase()))
  );

  const toggleBlock = async (profId: string, currentlyBlocked: boolean) => {
    const updates: any = { is_blocked: !currentlyBlocked };
    if (!currentlyBlocked) {
      updates.blocked_reason = blockReason || "";
    } else {
      updates.blocked_reason = "";
    }
    const { error } = await api.from("professionals").update(updates).eq("id", profId);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["admin-professionals"] });
      toast.success(currentlyBlocked ? "Profissional desbloqueado" : "Profissional bloqueado");
      setBlockReason("");
    }
  };

  const toggleFeature = async (profId: string, feature: string, currentValue: boolean) => {
    const { error } = await api
      .from("professionals")
      .update({ [feature]: !currentValue } as any)
      .eq("id", profId);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["admin-professionals"] });
      toast.success("Funcionalidade atualizada");
    }
  };

  const handleDeleteUser = async (profId: string, name: string) => {
    if (!confirm(`⚠️ ATENÇÃO: Isso excluirá permanentemente "${name}" e TODOS os dados associados (agendamentos, clientes, serviços, etc). Esta ação NÃO pode ser desfeita. Continuar?`)) return;
    setDeleting(profId);
    try {
      const deletePromise = api.functions.invoke("admin-delete-user", {
        body: { professionalId: profId },
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("A exclusão demorou demais. Tente novamente.")), 20000);
      });

      const res = await Promise.race([deletePromise, timeoutPromise]);

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`Usuário "${name}" excluído permanentemente`);
      qc.invalidateQueries({ queryKey: ["admin-professionals"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário");
    } finally {
      setDeleting(null);
    }
  };

  const handleImpersonate = async (userId: string, name: string) => {
    const adminPassword = prompt(`Digite sua senha de admin para entrar como "${name}":`);
    if (!adminPassword) return;
    setImpersonating(userId);
    try {
      const { data: { user: currentUser } } = await api.auth.getUser();
      if (!currentUser?.email) throw new Error("Não foi possível obter email do admin");

      const redirectUrl = window.location.origin + "/";
      const res = await api.functions.invoke("admin-impersonate", {
        body: { userId, redirectUrl },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      localStorage.setItem("admin_impersonation", JSON.stringify({
        adminEmail: currentUser.email,
        adminPassword,
        targetName: name,
      }));

      await api.auth.signOut();

      {
        const { error: verifyError } = await (api.auth as any).verifyOtp({
          token_hash: res.data.token_hash,
          type: "magiclink",
        });
        if (verifyError) {
          localStorage.removeItem("admin_impersonation");
          await api.auth.signInWithPassword({ email: currentUser.email, password: adminPassword });
          throw verifyError;
        }
        toast.success(`Logado como "${name}"`);
        window.location.href = "/";
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar na conta");
    } finally {
      setImpersonating(null);
    }
  };

  const featureLabels: Record<string, { label: string; icon: any }> = {
    feature_whatsapp: { label: "WhatsApp", icon: MessageCircle },
    feature_public_page: { label: "Página Pública", icon: Globe },
    feature_reports: { label: "Relatórios", icon: BarChart3 },
  };

  return (
    <AdminLayout title="Usuários" subtitle="Gerencie profissionais e salões">
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar profissional..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-accent text-accent-foreground text-sm font-semibold transition-all hover:opacity-90"
            >
              <Users size={16} />
              Cadastrar Profissional
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCreateSupport(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm font-semibold transition-all hover:bg-muted/80"
              >
                <Shield size={16} />
                Cadastrar Suporte
              </button>
            )}
          </div>

          <AdminCreateProfessional
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={() => qc.invalidateQueries({ queryKey: ["admin-professionals"] })}
          />
          <AdminCreateSupport
            open={showCreateSupport}
            onClose={() => setShowCreateSupport(false)}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["admin-professionals"] });
              qc.invalidateQueries({ queryKey: ["admin-support-users"] });
            }}
          />

          <div className="space-y-3">
            {filtered.map((p) => {
              const sub = Array.isArray(p.subscriptions) ? p.subscriptions[0] : p.subscriptions;
              const isExpanded = expanded === p.id;
              const isBlocked = p.is_blocked;

              return (
                <div key={p.id} className={cn("glass-card rounded-2xl overflow-hidden transition-all", isBlocked && "opacity-60 ring-1 ring-destructive/30")}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                      {isBlocked ? <Ban size={18} className="text-destructive" /> : <UserCheck size={18} className="text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">{p.name || "Sem nome"}</span>
                        <span className="text-[10px] text-muted-foreground">{p.account_type === "salon" ? "Salão" : "Autônomo"}</span>
                        {isBlocked && <span className="text-[10px] font-bold uppercase bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Bloqueado</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.email} · {p.business_name || "—"}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-semibold shrink-0",
                      sub?.plan_id === "enterprise" ? "bg-accent/10 text-accent" :
                      sub?.plan_id === "essencial" ? "bg-blue-500/10 text-blue-500" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {(sub?.plan_id || "none").toUpperCase()}
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">Telefone:</span> <span className="text-foreground font-medium">{p.phone || "—"}</span></div>
                        <div><span className="text-muted-foreground">Slug:</span> <span className="text-foreground font-mono">{p.slug || "—"}</span></div>
                        <div><span className="text-muted-foreground">Criado em:</span> <span className="text-foreground">{format(new Date(p.created_at), "dd/MM/yy", { locale: ptBR })}</span></div>
                        <div><span className="text-muted-foreground">Tipo:</span> <span className="text-foreground font-medium">{p.account_type === "salon" ? "Salão" : "Autônomo"}</span></div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funcionalidades</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(featureLabels).map(([key, { label, icon: Icon }]) => {
                            const enabled = (p as any)[key] !== false;
                            return (
                              <button
                                key={key}
                                onClick={() => toggleFeature(p.id, key, enabled)}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                  enabled ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                                )}
                              >
                                <Icon size={12} />
                                {label}
                                {enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Impersonate - admin only */}
                      {isAdmin && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <button
                            onClick={() => handleImpersonate(p.user_id, p.name)}
                            disabled={impersonating === p.user_id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors disabled:opacity-50"
                          >
                            {impersonating === p.user_id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <LogIn size={12} />
                            )}
                            Entrar como {p.name?.split(" ")[0] || "usuário"}
                          </button>
                        </div>
                      )}

                      {/* Block/Delete - admin only */}
                      {isAdmin && (
                        <div className="space-y-2 pt-2 border-t border-border">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bloqueio</h4>
                          {!isBlocked ? (
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">Motivo (opcional)</label>
                                <input
                                  value={blockReason}
                                  onChange={(e) => setBlockReason(e.target.value)}
                                  placeholder="Ex: Violação dos termos..."
                                  className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30"
                                />
                              </div>
                              <button
                                onClick={() => toggleBlock(p.id, false)}
                                className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors flex items-center gap-1.5 shrink-0"
                              >
                                <Ban size={12} /> Bloquear
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                  {p.blocked_reason ? <>Motivo: <span className="text-foreground">{p.blocked_reason}</span></> : "Sem motivo informado"}
                                </div>
                                <button
                                  onClick={() => toggleBlock(p.id, true)}
                                  className="px-4 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors flex items-center gap-1.5"
                                >
                                  <UserCheck size={12} /> Desbloquear
                                </button>
                              </div>
                              <button
                                onClick={() => handleDeleteUser(p.id, p.name)}
                                disabled={deleting === p.id}
                                className="w-full px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {deleting === p.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 size={14} />
                                    Excluir Permanentemente
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground text-sm">Nenhum profissional encontrado</div>
          )}
          <p className="text-xs text-muted-foreground">{filtered.length} profissionais</p>

          {/* Support Users Section - admin only */}
          {isAdmin && (
            <div className="pt-6 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-accent" />
                <h3 className="text-lg font-bold text-foreground">Equipe de Suporte</h3>
                <span className="text-xs text-muted-foreground">({supportUsers?.length || 0})</span>
              </div>

              {loadingSupport ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
              ) : supportUsers && supportUsers.length > 0 ? (
                <div className="glass-card rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-muted-foreground font-medium">Nome</th>
                        <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                        <th className="text-left p-4 text-muted-foreground font-medium">Criado em</th>
                        <th className="text-right p-4 text-muted-foreground font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supportUsers.map((s: any) => (
                        <tr key={s.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Shield size={14} className="text-accent" />
                              <span className="font-medium text-foreground">{s.name || "—"}</span>
                            </div>
                          </td>
                          <td className="p-4 text-muted-foreground">{s.email}</td>
                          <td className="p-4 text-muted-foreground">
                            {format(new Date(s.created_at), "dd/MM/yy", { locale: ptBR })}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => {
                                if (confirm(`Remover papel de suporte de ${s.name}?`)) {
                                  removeSupportRole.mutate(s.user_id);
                                }
                              }}
                              disabled={removeSupportRole.isPending}
                              className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                              title="Remover suporte"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground text-sm">
                  Nenhum agente de suporte cadastrado
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminUsers;
