import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowLeft, Check, ArrowRight, Menu, X, Calendar, Zap, CreditCard, BarChart3, Users, DollarSign, UsersRound, ShoppingCart, Percent, Award, Megaphone, Sparkles, RefreshCw, StarHalf, Instagram, Cloud, Package, Camera, FileText } from "lucide-react";
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

const featuresData: Record<string, {
  title: string;
  subtitle: string;
  description: string;
  benefits: string[];
  image: string;
  icon: any;
}> = {
  agenda: {
    title: "Agenda Online",
    subtitle: "Sistema completo de agendamento 24/7",
    description: "Seus clientes podem agendar a qualquer momento, pelo celular ou computador. Sem complicação, sem звitagen.",
    benefits: ["Disponível 24/7", "Confirmação automática", "Horário flexível", "Sem necessidade de app", "Link compartilhável"],
    image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&h=400&fit=crop",
    icon: Calendar,
  },
  lembretes: {
    title: "Lembretes Automáticos",
    subtitle: "Reduza faltas em até 60%",
    description: "Envio automático de lembretes via WhatsApp antes do atendimento. Seus clientes nunca mais esquecem do horário.",
    benefits: ["Reduz faltas em 60%", "Automático", "Personalizável", "Por WhatsApp", "Mensagens customizadas"],
    image: "https://images.unsplash.com/photo-1556745757-8d76bdb8e4c2?w=600&h=400&fit=crop",
    icon: Zap,
  },
  pagamentos: {
    title: "Pagamentos Integrados",
    subtitle: "PIX, cartão e dinheiro",
    description: "Aceite todas as formas de pagamento. Tudo registrado automaticamente no sistema.",
    benefits: ["PIX", "Cartão de crédito/débito", "Dinheiro", "Registro automático", "Relatórios"],
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&h=400&fit=crop",
    icon: CreditCard,
  },
  relatorios: {
    title: "Relatórios e Análises",
    subtitle: "Dashboards completos",
    description: "Métricas importantes: faturamento, serviços mais vendidos, clientes top e muito mais.",
    benefits: ["Dashboard completo", "Métricas em tempo real", "Exportação", "Análises detalhadas", "Gráficos visuais"],
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
    icon: BarChart3,
  },
  clientes: {
    title: "Gestão de Clientes",
    subtitle: "Histórico completo",
    description: "Veja o histórico de cada cliente, preferências, birthdays e anotações importantes.",
    benefits: ["Histórico completo", "Segmentação", "Aniversários", "Preferências", "Anotações"],
    image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&h=400&fit=crop",
    icon: Users,
  },
  financeiro: {
    title: "Controle Financeiro",
    subtitle: "Receitas, despesas e lucro",
    description: "Tudo em um só lugar. Controle total do seu dinheiro.",
    benefits: ["Receitas e despesas", "Comissões automatizadas", "Lucro real", "Fluxo de caixa", "Relatórios"],
    image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&h=400&fit=crop",
    icon: DollarSign,
  },
  equipe: {
    title: "Gestão de Equipe",
    subtitle: "Profissionais e comissões",
    description: "Gerencie profissionais, atribua serviços, configure horários e acompanhe performance.",
    benefits: ["Múltiplos profissionais", "Permissões", "Performance", "Comissões", "Horários"],
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&h=400&fit=crop",
    icon: UsersRound,
  },
  produtos: {
    title: "Gestão de Produtos",
    subtitle: "Controle de estoque",
    description: "Cadastro, controle de quantidade e vendas de produtos.",
    benefits: ["Estoque completo", "Vendas integradas", "Alertas", "Produtos ilimitados", "Categorias"],
    image: "https://images.unsplash.com/photo-1472851294608-062f824d29ad?w=600&h=400&fit=crop",
    icon: ShoppingCart,
  },
  cupons: {
    title: "Cupons e Promoções",
    subtitle: "Descontos personalizados",
    description: "Crie cupons de desconto, promoções especiais e controle total.",
    benefits: ["Descontos", "Validade configurável", "Uso único/múltiplo", "Código promocional", "Limite de uso"],
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop",
    icon: Percent,
  },
  fidelidade: {
    title: "Programa de Fidelidade",
    subtitle: "Pontos e cashback",
    description: "Sistema de pontos, cashback e recompensas para fidelizar clientes.",
    benefits: ["Pontos e cashback", "Níveis de cliente", "Desafios", "Recompensas", "Histórico"],
    image: "https://images.unsplash.com/photo-1530103862676-de3c9a59af38?w=600&h=400&fit=crop",
    icon: Award,
  },
  campanhas: {
    title: "Campanhas WhatsApp",
    subtitle: "Marketing em massa",
    description: "Envio de promoções, novidades e lembretes para toda sua base.",
    benefits: ["Envio em massa", "Segmentação", "Agendamento", "Templates", "Relatórios"],
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&h=400&fit=crop",
    icon: Megaphone,
  },
  upsell: {
    title: "Upsell Inteligente",
    subtitle: "Aumenta o ticket médio",
    description: "Sugestões automáticas de serviços complementares no momento do agendamento.",
    benefits: ["Aumenta ticket médio", "Automático", "Personalizável", "Sugestões smart", "Mais vendas"],
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=400&fit=crop",
    icon: Sparkles,
  },
  reativacao: {
    title: "Reativação de Clientes",
    subtitle: "Recupere clientes inativos",
    description: "Engine automático para recuperar clientes que não.visitam há muito tempo.",
    benefits: ["Recupera clientes", "Automático", "Mensagens personalizadas", "Segmentação", "Relatórios"],
    image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop",
    icon: RefreshCw,
  },
  avaliacoes: {
    title: "Avaliações de Clientes",
    subtitle: "Colete feedbacks",
    description: "Colete feedbacks e avaliações após cada atendimento.",
    benefits: ["Feedback automático", "Nota média", "Respostas", "Histórico", "Melhoria contínua"],
    image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop",
    icon: StarHalf,
  },
  instagram: {
    title: "Automação Instagram",
    subtitle: "Direct e comentários",
    description: "Respostas automáticas no Direct, comentários e stories.",
    benefits: ["Auto-resposta", "Agendamento", "Keywords", "Não perde leads", "24/7"],
    image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7f6c0?w=600&h=400&fit=crop",
    icon: Instagram,
  },
  "google-calendar": {
    title: "Google Calendar",
    subtitle: "Sincronização automática",
    description: "Sincronize sua agenda com o Google Calendar. Nunca perca um compromisso.",
    benefits: ["Sincronização two-way", "Eventos automáticos", "Disponibilidade", "Integrado", "Sempre atualizado"],
    image: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&h=400&fit=crop",
    icon: Cloud,
  },
  pacotes: {
    title: "Pacotes de Serviços",
    subtitle: "Venda de pacotes",
    description: "Venda pacotes de serviços com desconto. Gere receita recorrente.",
    benefits: ["Pacotes personalizados", "Validade configurável", "Saldo automático", "Renovação", "Mais receita"],
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
    icon: Package,
  },
  "pagina-publica": {
    title: "Página Pública",
    subtitle: "Agenda online personalizada",
    description: "Página de agendamento online com link único para seus clientes.",
    benefits: ["Link personalizado", "Sem necessidade de app", "Responsiva", "SEO", "Compartilhável"],
    image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&h=400&fit=crop",
    icon: Camera,
  },
  "lista-espera": {
    title: "Lista de Espera",
    subtitle: "Gerencie demanda",
    description: "Quando não houver horários disponíveis, clientes podem entrar na lista de espera.",
    benefits: ["Não perde clientes", "Notificação automática", "Priorização", "Escalação", "Automático"],
    image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=400&fit=crop",
    icon: FileText,
  },
  "assistente-ia": {
    title: "Assistente IA",
    subtitle: "Automação inteligente",
    description: "Automação inteligente com IA para otimizar atendimentos e follow-ups.",
    benefits: ["Respostas smart", "Agendamento automático", "Reduz trabalho", "24/7", "Economia de tempo"],
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop",
    icon: Sparkles,
  },
};

const FeatureDetail = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const feature = slug ? featuresData[slug] : null;
  const Icon = feature?.icon || Calendar;

  const goToSignup = () => navigate("/auth?mode=signup");
  const navTo = (path: string) => { navigate(path); setMobileMenuOpen(false); };

  if (!feature) {
    return (
      <div className="min-h-screen bg-[#fdf8f3] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#3d2c1e] mb-4">Recurso não encontrado</h1>
          <button onClick={() => navigate("/features")} className="bg-[#eebf9c] px-6 py-3 rounded-full font-bold">
            Voltar aos recursos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdf8f3] text-[#3d2c1e]">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-[#e8dcc8]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="sm:hidden p-2 -ml-2">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <button onClick={() => navigate("/features")} className="p-2 hover:bg-[#f5dcc3] rounded-lg">
              <ArrowLeft className="w-5 h-5 text-[#6b5a4a]" />
            </button>
            <button onClick={() => navigate("/")} className="flex items-center gap-2">
              <img src={logo} alt="Logo" className="w-8 h-8 rounded-xl" />
              <span className="font-bold">Gende</span>
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <button onClick={() => navTo("/pricing")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Preços</button>
            <button onClick={() => navTo("/support")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Suporte</button>
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
              <button onClick={goToSignup} className="mt-2 bg-[#eebf9c] py-3 rounded-full font-bold text-center">Começar agora</button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <motion.section style={{ opacity: heroOpacity }} className="pt-24 pb-10 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <button onClick={() => navigate("/features")} className="flex items-center gap-1 text-[#d4a84b] text-sm mb-4 hover:underline">
              <ArrowLeft size={16} /> Voltar para recursos
            </button>
          </FadeInSection>
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <FadeInSection delay={0.1} className="flex-1">
              <div className="w-16 h-16 rounded-2xl bg-[#f5dcc3] flex items-center justify-center mb-5">
                <Icon className="w-8 h-8 text-[#d4a84b]" />
              </div>
              <span className="text-[#d4a84b] font-medium text-sm">Recurso</span>
              <h1 className="text-2xl sm:text-4xl font-extrabold mt-2 mb-4">{feature.title}</h1>
              <p className="text-[#6b5a4a] text-base sm:text-lg mb-6">{feature.subtitle}</p>
              <p className="text-[#6b5a4a] leading-relaxed mb-8">{feature.description}</p>
              
              <div className="flex gap-3 flex-wrap">
                <button onClick={goToSignup} className="bg-[#eebf9c] text-[#3d2c1e] px-6 py-3 rounded-full font-bold">
                  Experimentar grátis
                </button>
                <button onClick={() => navigate("/pricing")} className="bg-white border border-[#e8dcc8] text-[#3d2c1e] px-6 py-3 rounded-full font-semibold">
                  Ver preços
                </button>
              </div>
            </FadeInSection>
            
            <FadeInSection delay={0.2} className="w-full md:w-1/2">
              <div className="rounded-2xl overflow-hidden shadow-xl border border-[#e8dcc8]">
                <img src={feature.image} alt={feature.title} className="w-full h-64 sm:h-80 object-cover" />
              </div>
            </FadeInSection>
          </div>
        </div>
      </motion.section>

      {/* Benefits */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">O que você ganha</h2>
          </FadeInSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {feature.benefits.map((benefit, i) => (
              <FadeInSection key={i} delay={0.1 + i * 0.05}>
                <div className="flex items-center gap-3 bg-[#fdf8f3] p-4 rounded-xl border border-[#e8dcc8]">
                  <div className="w-6 h-6 rounded-full bg-[#eebf9c] flex items-center justify-center shrink-0">
                    <Check size={14} className="text-[#d4a84b]" />
                  </div>
                  <span className="font-medium text-[#3d2c1e]">{benefit}</span>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4 bg-[#eebf9c]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-[#3d2c1e] mb-3">
            Pronto para usar este recurso?
          </h2>
          <p className="text-[#3d2c1e]/80 mb-6">Comece seu teste gratuito de 30 dias.</p>
          <button onClick={goToSignup} className="bg-[#3d2c1e] text-white px-8 py-3 rounded-full font-bold inline-flex items-center gap-2">
            Criar conta gratuita <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-[#3d2c1e]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2"><img src={logo} alt="Logo" className="w-7 h-7 rounded-lg" /><span className="font-bold text-[#f5dcc3]">Gende</span></div>
          <p className="text-[#f5dcc3]/50 text-xs">© {new Date().getFullYear()} Gende</p>
        </div>
      </footer>
    </div>
  );
};

export default FeatureDetail;