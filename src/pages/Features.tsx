import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Menu, X, ArrowRight, Calendar, Users, BarChart3, MessageCircle, CreditCard, Gift, Zap, Star, Cloud, Package, Camera, FileText, Sparkles, Megaphone, RefreshCw, StarHalf, Instagram, DollarSign, UsersRound, Percent, ShoppingCart, Award } from "lucide-react";
import logo from "@/assets/logo-circle.png";

const FadeInSection = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay }} className={className}>
      {children}
    </motion.div>
  );
};

const Features = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const navTo = (path: string) => { navigate(path); setMobileMenuOpen(false); };
  const goToSignup = () => { navigate("/auth?mode=signup"); setMobileMenuOpen(false); };

  const allFeatures = [
    { icon: Calendar, title: "Agenda Online", desc: "Agendamento 24/7 para seus clientes", link: "/features/agenda" },
    { icon: Zap, title: "Lembretes Automáticos", desc: "Reduza faltas com WhatsApp", link: "/features/lembretes" },
    { icon: CreditCard, title: "Pagamentos", desc: "PIX, cartão e dinheiro", link: "/features/pagamentos" },
    { icon: BarChart3, title: "Relatórios", desc: "Dashboards e análises", link: "/features/relatorios" },
    { icon: Users, title: "Clientes", desc: "Histórico completo", link: "/features/clientes" },
    { icon: DollarSign, title: "Financeiro", desc: "Receitas e despesas", link: "/features/financeiro" },
    { icon: UsersRound, title: "Equipe", desc: "Profissionais e comissões", link: "/features/equipe" },
    { icon: ShoppingCart, title: "Produtos", desc: "Controle de estoque", link: "/features/produtos" },
    { icon: Percent, title: "Cupons", desc: "Promoções e descontos", link: "/features/cupons" },
    { icon: Award, title: "Fidelidade", desc: "Pontos e cashback", link: "/features/fidelidade" },
    { icon: Megaphone, title: "Campanhas", desc: "Marketing WhatsApp", link: "/features/campanhas" },
    { icon: Sparkles, title: "Upsell", desc: "Serviços complementares", link: "/features/upsell" },
    { icon: RefreshCw, title: "Reativação", desc: "Clientes inativos", link: "/features/reativacao" },
    { icon: StarHalf, title: "Avaliações", desc: "Feedbacks", link: "/features/avaliacoes" },
    { icon: Instagram, title: "Instagram", desc: "Automação Direct", link: "/features/instagram" },
    { icon: Cloud, title: "Google Calendar", desc: "Sincronização", link: "/features/google-calendar" },
    { icon: Package, title: "Pacotes", desc: "Venda de pacotes", link: "/features/pacotes" },
    { icon: Camera, title: "Página Pública", desc: "Agenda online", link: "/features/pagina-publica" },
    { icon: FileText, title: "Lista de Espera", desc: "Gerencie demanda", link: "/features/lista-espera" },
    { icon: Sparkles, title: "Assistente IA", desc: "Automação inteligente", link: "/features/assistente-ia" },
  ];

  return (
    <div className="min-h-screen bg-[#fdf8f3] text-[#3d2c1e]">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-[#e8dcc8]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="sm:hidden p-2 -ml-2">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <button onClick={() => navigate("/")} className="flex items-center gap-2">
              <img src={logo} alt="Logo" className="w-8 h-8 rounded-xl" />
              <span className="font-bold">Gende</span>
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <button onClick={() => navTo("/pricing")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Preços</button>
            <button onClick={() => navTo("/support")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Suporte</button>
            <button onClick={() => navTo("/auth")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Entrar</button>
            <button onClick={goToSignup} className="bg-[#eebf9c] px-4 py-1.5 rounded-full text-sm font-bold">Começar</button>
          </div>
          <button onClick={goToSignup} className="sm:hidden bg-[#eebf9c] px-3 py-1.5 rounded-full text-sm font-bold">Começar</button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-t border-[#e8dcc8] py-3 px-4">
            <div className="flex flex-col gap-2">
              <button onClick={() => navTo("/")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Início</button>
              <button onClick={() => navTo("/pricing")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Preços</button>
              <button onClick={() => navTo("/support")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Suporte</button>
              <button onClick={() => navTo("/auth")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Entrar</button>
              <button onClick={goToSignup} className="mt-2 bg-[#eebf9c] py-3 rounded-full font-bold text-center">Começar agora</button>
            </div>
          </div>
        )}
      </nav>

      <motion.section style={{ opacity: heroOpacity }} className="pt-24 pb-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <FadeInSection>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f5dcc3] text-[#d4a84b] text-sm font-medium mb-4">
              <Zap className="w-4 h-4" /> Recursos completos
            </span>
          </FadeInSection>
          <FadeInSection delay={0.1}>
            <h1 className="text-2xl sm:text-4xl font-extrabold mb-4">Tudo para fazer <span className="text-[#d4a84b]">crescer</span></h1>
          </FadeInSection>
          <FadeInSection delay={0.2}>
            <p className="text-[#6b5a4a] max-w-xl mx-auto mb-6">Clique em qualquer recurso para ver detalhes.</p>
          </FadeInSection>
        </div>
      </motion.section>

      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {allFeatures.map((f, i) => (
              <FadeInSection key={i} delay={0.02 * i}>
                <a href={f.link} className="block bg-white rounded-2xl p-4 sm:p-5 border border-[#e8dcc8] hover:border-[#eebf9c] hover:shadow-lg transition-all group">
                  <div className="w-10 h-10 rounded-xl bg-[#f5dcc3] flex items-center justify-center mb-3 group-hover:bg-[#eebf9c] transition-colors">
                    <f.icon className="w-5 h-5 text-[#d4a84b]" />
                  </div>
                  <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-[#6b5a4a] line-clamp-2">{f.desc}</p>
                </a>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 bg-[#eebf9c]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold text-[#3d2c1e] mb-3">Comece hoje mesmo</h2>
          <p className="text-[#3d2c1e]/80 mb-6">30 dias de teste gratuito.</p>
          <button onClick={goToSignup} className="bg-[#3d2c1e] text-white px-8 py-3 rounded-full font-bold">Criar conta gratuita</button>
        </div>
      </section>

      <footer className="py-8 px-4 bg-[#3d2c1e]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2"><img src={logo} alt="Logo" className="w-7 h-7 rounded-lg" /><span className="font-bold text-[#f5dcc3]">Gende</span></div>
          <div className="flex gap-4 text-sm"><a href="/pricing" className="text-[#f5dcc3]/70">Preços</a><a href="/support" className="text-[#f5dcc3]/70">Suporte</a></div>
          <p className="text-[#f5dcc3]/50 text-xs">© {new Date().getFullYear()} Gende</p>
        </div>
      </footer>
    </div>
  );
};

export default Features;