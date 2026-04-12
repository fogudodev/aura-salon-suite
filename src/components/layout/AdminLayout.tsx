import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarDays,
  MessageSquare,
  Sliders,
  BarChart3,
  LogOut,
  Shield,
  Zap,
  Crown,
  ScrollText,
  Settings,
  X,
  FileText,
  UserCog,
  Headphones,
  Wallet,
  Star,
  Flag,
  TestTube2,
} from "lucide-react";
import logo from "@/assets/logo-circle.png";

const allAdminNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin", supportAccess: true },
  { icon: Users, label: "Usuários", path: "/admin/users", supportAccess: true },
  { icon: Crown, label: "Planos", path: "/admin/plans", supportAccess: true },
  { icon: CreditCard, label: "Assinantes", path: "/admin/subscribers", supportAccess: true },
  { icon: Zap, label: "Integrações", path: "/admin/integrations", supportAccess: true },
  { icon: Settings, label: "Funcionalidades", path: "/admin/features", supportAccess: true },
  { icon: CalendarDays, label: "Agendamentos", path: "/admin/bookings", supportAccess: true },
  { icon: MessageSquare, label: "WhatsApp", path: "/admin/whatsapp", supportAccess: true },
  { icon: TestTube2, label: "WhatsApp Lab", path: "/admin/whatsapp-lab", supportAccess: false },
  { icon: Sliders, label: "Limites de Plano", path: "/admin/plan-limits", supportAccess: false },
  { icon: UserCog, label: "Limites Individuais", path: "/admin/professional-limits", supportAccess: true },
  { icon: BarChart3, label: "Uso de Mensagens", path: "/admin/message-usage", supportAccess: true },
  { icon: Headphones, label: "Chat Suporte", path: "/admin/support-chat", supportAccess: true },
  { icon: Wallet, label: "Chat Pagamento", path: "/admin/payment-chat", supportAccess: true },
  { icon: FileText, label: "Logs", path: "/admin/logs", supportAccess: true },
  { icon: Star, label: "Avaliações Plataforma", path: "/admin/platform-reviews", supportAccess: true },
  { icon: Flag, label: "Feature Flags", path: "/admin/feature-flags", supportAccess: false },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AdminLayout = ({ children, title, subtitle }: AdminLayoutProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  const adminNavItems = isAdmin
    ? allAdminNavItems
    : allAdminNavItems.filter(item => item.supportAccess);

  const mobileAdminNavItems = adminNavItems.slice(0, 4);

  const roleLabel = isAdmin ? "ADMIN" : "SUPORTE";

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 flex items-center justify-around h-16 md:hidden safe-area-bottom">
        {mobileAdminNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
                isActive ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm animate-overlay-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-card/95 backdrop-blur-xl border-r border-border p-4 flex flex-col animate-slide-in-left shadow-2xl">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Shield size={20} className="text-accent flex-shrink-0" />
                <span className="font-bold text-foreground truncate">{isAdmin ? "Admin Master" : "Suporte"}</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-muted-foreground">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto pb-4 scrollbar-none">
              {adminNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={async () => { await signOut(); navigate("/auth"); }}
              className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm">Sair</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex glass-sidebar fixed left-0 top-0 h-screen z-50 flex-col transition-all duration-300 ${
          expanded ? "w-[240px]" : "w-[72px]"
        }`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="flex items-center gap-3 px-4 h-[64px] border-b border-sidebar-border">
          <Shield size={24} className="text-accent shrink-0" />
          {expanded && (
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
              {isAdmin ? "Admin Master" : "Suporte"}
            </span>
          )}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {adminNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <item.icon size={18} className={isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"} />
                {expanded && <span className="text-sm font-medium">{item.label}</span>}
                {isActive && expanded && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={async () => { await signOut(); navigate("/auth"); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors rounded-lg hover:bg-sidebar-accent/50"
          >
            <LogOut size={18} />
            {expanded && <span className="text-sm">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:ml-[72px] transition-all duration-300 pb-20 md:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border">
          <div className="flex items-center justify-between h-[64px] px-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <Shield size={20} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-foreground">{title}</h1>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase bg-accent/10 text-accent px-2 py-1 rounded-full">
                {roleLabel}
              </span>
            </div>
          </div>
        </header>
        <main className="p-3 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
