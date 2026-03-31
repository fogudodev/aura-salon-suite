import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Calendar, Bell, CreditCard, BarChart3, Users, DollarSign,
  X, Star, Check, Gift, Shield, ArrowRight, Zap, ChevronDown,
  Clock, TrendingUp, MessageCircle, Package, UsersRound, Percent,
  Camera, Mail, MapPin, Video, Headphones, Settings, FileText,
  BarChart, PieChart, Wallet, ShoppingCart, Award, Megaphone,
  RefreshCw, StarHalf, Instagram, Cloud, Sparkles, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-circle.png";

const COLORS = {
  primary: "#eebf9c",
  primaryDark: "#d4a84b",
  primaryLight: "#f5dcc3",
  background: "#fdf8f3",
  backgroundAlt: "#faf3e8",
  text: "#3d2c1e",
  textLight: "#6b5a4a",
  cardBg: "#ffffff",
  border: "#e8dcc8",
};

const FadeInSection = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-[#e8dcc8] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
      >
        <span className="font-semibold text-[#3d2c1e] text-sm sm:text-base">{question}</span>
        <ChevronDown
          size={18}
          className={`text-[#6b5a4a] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-[#6b5a4a] text-sm sm:text-base leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, desc, link, delay }: { icon: any; title: string; desc: string; link: string; delay: number }) => {
  const navigate = useNavigate();
  return (
    <FadeInSection delay={delay}>
      <button
        onClick={() => navigate(link)}
        className="w-full text-left bg-white rounded-2xl p-5 sm:p-6 border border-[#e8dcc8] hover:border-[#eebf9c] hover:shadow-lg transition-all group"
      >
        <div className="w-12 h-12 rounded-xl bg-[#f5dcc3] flex items-center justify-center mb-4 group-hover:bg-[#eebf9c] transition-colors">
          <Icon className="w-6 h-6 text-[#d4a84b]" />
        </div>
        <h3 className="font-bold text-[#3d2c1e] mb-2 text-sm sm:text-base">{title}</h3>
        <p className="text-[#6b5a4a] text-xs sm:text-sm leading-relaxed line-clamp-2">{desc}</p>
        <div className="flex items-center gap-1 text-[#d4a84b] text-xs font-medium mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>Ver detalhes</span>
          <ChevronRight size={14} />
        </div>
      </button>
    </FadeInSection>
  );
};

const AnimatedCounter = ({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{prefix}{count.toLocaleString("pt-BR")}{suffix}</span>;
};

const Landing = () => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const goToSignup = () => {
    navigate("/auth?mode=signup");
    setMobileMenuOpen(false);
  };

  const navTo = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const allFeatures = [
    { icon: Calendar, title: "Agenda Online", desc: "Agendamento 24/7 disponível para seus clientes", link: "/features/agenda" },
    { icon: Bell, title: "Lembretes Automáticos", desc: "Reduza faltas com notificações via WhatsApp", link: "/features/lembretes" },
    { icon: CreditCard, title: "Pagamentos", desc: "PIX, cartão e dinheiro integrados", link: "/features/pagamentos" },
    { icon: BarChart3, title: "Relatórios", desc: "Dashboards e análises detalhadas", link: "/features/relatorios" },
    { icon: Users, title: "Gestão de Clientes", desc: "Histórico completo e segmentação", link: "/features/clientes" },
    { icon: DollarSign, title: "Financeiro", desc: "Controle de receitas, despesas e lucro", link: "/features/financeiro" },
    { icon: UsersRound, title: "Equipe", desc: "Gerencie profissionais e comissões", link: "/features/equipe" },
    { icon: Package, title: "Produtos", desc: "Controle de estoque e vendas", link: "/features/produtos" },
    { icon: Percent, title: "Cupons", desc: "Crie promoções e descuentos", link: "/features/cupons" },
    { icon: Gift, title: "Programa Fidelidade", desc: "Pontos, cashback e recompensas", link: "/features/fidelidade" },
    { icon: Megaphone, title: "Campanhas", desc: "Marketing via WhatsApp em massa", link: "/features/campanhas" },
    { icon: Zap, title: "Upsell", desc: "Sugestões de serviços complementares", link: "/features/upsell" },
    { icon: RefreshCw, title: "Reativação", desc: "Recupere clientes inativos", link: "/features/reativacao" },
    { icon: StarHalf, title: "Avaliações", desc: "Colete feedbacks dos clientes", link: "/features/avaliacoes" },
    { icon: Instagram, title: "Instagram", desc: "Automação e mensagens directas", link: "/features/instagram" },
    { icon: Cloud, title: "Google Calendar", desc: "Sincronização automática", link: "/features/google-calendar" },
    { icon: Package, title: "Pacotes", desc: "Venda pacotes de serviços", link: "/features/pacotes" },
    { icon: Camera, title: "Página Pública", desc: "Sua agenda online personalizada", link: "/features/pagina-publica" },
    { icon: FileText, title: "Lista de Espera", desc: "Gerencie demanda de horários", link: "/features/lista-espera" },
    { icon: Sparkles, title: "Assistente IA", desc: "Automação inteligente com IA", link: "/features/assistente-ia" },
  ];

  const testimonials = [
    { name: "Carla M.", role: "Cabeleireira", text: "Aumentei 38% do faturamento em 2 meses.", stars: 5 },
    { name: "Rafael S.", role: "Barbeiro", text: "Reduzi faltas em quase 60%. Os lembretes mudaram meu negócio.", stars: 5 },
    { name: "Ana P.", role: "Dona de salão", text: "Hoje tenho previsibilidade do meu mês inteiro.", stars: 5 },
  ];

  const plans = [
    {
      name: "Essencial",
      desc: "Perfeito para autônomos",
      price: billingCycle === "monthly" ? "49,90" : "41,66",
      priceLabel: "/mês",
      annualLabel: billingCycle === "annual" ? "R$ 499/ano" : "",
      features: [
        "Agendamentos ilimitados",
        "Serviços ilimitados",
        "Clientes ilimitados",
        "WhatsApp automático",
        "Relatórios completos",
        "Página pública",
        "Suporte prioritário",
      ],
      cta: "Assinar agora",
      popular: true,
    },
    {
      name: "Enterprise",
      desc: "Para salões com equipe",
      price: billingCycle === "monthly" ? "99,90" : "83,25",
      priceLabel: "/mês",
      annualLabel: billingCycle === "annual" ? "R$ 999/ano" : "",
      features: [
        "Tudo do Essencial",
        "5 profissionais",
        "Comissões automatizadas",
        "Google Calendar",
        "Programa de fidelidade",
        "Campanhas ilimitadas",
        "Assistente IA",
        "Suporte VIP 24/7",
      ],
      cta: "Assinar agora",
      popular: false,
    },
  ];

  const faqs = [
    { q: "Como funciona o teste grátis?", a: "Você cria sua conta e tem 30 dias para testar todos os recursos. Após esse período, escolha seu plano." },
    { q: "Quais formas de pagamento?", a: "Aceitamos PIX, cartão de crédito (parcelado) e Boleto. O plano anual tem 20% de desconto." },
    { q: "Posso cancelar a qualquer momento?", a: "Sim! Cancelamento sem multas ou burocracias. Você continua tendo acesso até o fim do período pago." },
    { q: "Funciona no celular?", a: "Sim! O Gende funciona perfeitamente em qualquer dispositivo - celular, tablet ou computador." },
    { q: "Meus clientes precisam baixar app?", a: "Não! Seus clientes agendam direto pela sua página pública, pelo WhatsApp ou Instagram." },
    { q: "Como funciona o WhatsApp automático?", a: "Conecte sua instância e o sistema envia confirmações, lembretes e follow-ups automaticamente." },
  ];

  return (
    <div className="min-h-screen bg-[#fdf8f3] text-[#3d2c1e] overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-[#e8dcc8]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="sm:hidden p-2 -ml-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <button onClick={() => navigate("/")} className="flex items-center gap-2">
              <img src={logo} alt="Logo" className="w-8 h-8 rounded-xl" />
              <span className="font-bold text-base text-[#3d2c1e]">Gende</span>
            </button>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => navTo("/pricing")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e] font-medium">
              Preços
            </button>
            <button onClick={() => navTo("/features")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e] font-medium">
              Recursos
            </button>
            <button onClick={() => navTo("/support")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e] font-medium">
              Suporte
            </button>
            <button onClick={() => navTo("/auth")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e] font-medium">
              Entrar
            </button>
            <button onClick={goToSignup} className="bg-[#eebf9c] hover:bg-[#d4a84b] text-[#3d2c1e] px-4 py-1.5 rounded-full text-sm font-bold">
              Começar agora
            </button>
          </div>
          
          {/* Mobile CTA */}
          <button onClick={goToSignup} className="sm:hidden bg-[#eebf9c] text-[#3d2c1e] px-3 py-1.5 rounded-full text-sm font-bold">
            Começar
          </button>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-t border-[#e8dcc8] py-3 px-4">
            <div className="flex flex-col gap-2">
              <button onClick={() => navTo("/")} className="text-left px-3 py-2 text-[#3d2c1e] font-medium border-b border-[#e8dcc8]">
                Início
              </button>
              <button onClick={() => navTo("/pricing")} className="text-left px-3 py-2 text-[#3d2c1e] font-medium border-b border-[#e8dcc8]">
                Preços
              </button>
              <button onClick={() => navTo("/features")} className="text-left px-3 py-2 text-[#3d2c1e] font-medium border-b border-[#e8dcc8]">
                Recursos
              </button>
              <button onClick={() => navTo("/support")} className="text-left px-3 py-2 text-[#3d2c1e] font-medium border-b border-[#e8dcc8]">
                Suporte
              </button>
              <button onClick={() => navTo("/auth")} className="text-left px-3 py-2 text-[#3d2c1e] font-medium border-b border-[#e8dcc8]">
                Entrar
              </button>
              <button onClick={goToSignup} className="mt-2 bg-[#eebf9c] text-[#3d2c1e] py-3 rounded-full font-bold text-center">
                Começar agora
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <motion.section style={{ opacity: heroOpacity }} className="pt-24 pb-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <FadeInSection>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f5dcc3] text-[#d4a84b] text-xs font-medium mb-4">
              Sistema completo para salões
            </span>
          </FadeInSection>

          <FadeInSection delay={0.1}>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
              Organize, <span className="text-[#d4a84b]">automatize</span> e faça crescer
            </h1>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <p className="text-sm sm:text-lg text-[#6b5a4a] max-w-xl mx-auto mb-6 leading-relaxed">
              Tudo que você precisa para gerenciar seu salão em um só lugar: agenda, clientes, finanças e muito mais.
            </p>
          </FadeInSection>

          <FadeInSection delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={goToSignup}
                className="bg-[#eebf9c] hover:bg-[#d4a84b] text-[#3d2c1e] px-6 sm:px-8 py-3 sm:py-4 rounded-full font-bold text-sm sm:text-base shadow-lg"
              >
                Começar agora
              </button>
              <button
                onClick={() => navigate("/features")}
                className="bg-white border border-[#e8dcc8] text-[#3d2c1e] px-6 sm:px-8 py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base"
              >
                Ver recursos
              </button>
            </div>
          </FadeInSection>

          {/* Stats */}
          <FadeInSection delay={0.4} className="mt-10 sm:mt-14">
            <div className="flex justify-center gap-6 sm:gap-12">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-[#d4a84b]">
                  <AnimatedCounter target={5000} suffix="+" />
                </p>
                <p className="text-xs sm:text-sm text-[#6b5a4a]">Profissionais</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-[#d4a84b]">
                  <AnimatedCounter target={200000} prefix="R$ " suffix="+" />
                </p>
                <p className="text-xs sm:text-sm text-[#6b5a4a]">Faturado</p>
              </div>
            </div>
          </FadeInSection>
        </div>
      </motion.section>

      {/* All Features Grid */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-3xl font-bold text-center mb-3">
              Todos os recursos que você precisa
            </h2>
            <p className="text-center text-[#6b5a4a] mb-8 text-sm sm:text-base">
              Clique em qualquer um para ver detalhes
            </p>
          </FadeInSection>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {allFeatures.map((f, i) => (
              <FeatureCard key={i} {...f} delay={0.02 * i} />
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 px-4 bg-[#faf3e8]">
        <div className="max-w-3xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-3xl font-bold text-center mb-8">
              Por que usar o Gende?
            </h2>
          </FadeInSection>
          <div className="space-y-3">
            {[
              "Agenda automatizada 24/7",
              "Reduza faltas com lembretes",
              "Controle financeiro completo",
              "Gestão de clientes e equipe",
              "Marketing automático",
              "Suporte humanizado",
            ].map((item, i) => (
              <FadeInSection key={i} delay={0.1 + i * 0.05}>
                <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-[#e8dcc8]">
                  <div className="w-6 h-6 rounded-full bg-[#eebf9c] flex items-center justify-center shrink-0">
                    <Check size={14} className="text-[#d4a84b]" />
                  </div>
                  <span className="text-sm sm:text-base text-[#3d2c1e] font-medium">{item}</span>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-3xl font-bold text-center mb-8">
              O que dizem nossos clientes
            </h2>
          </FadeInSection>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <FadeInSection key={i} delay={0.1 + i * 0.1}>
                <div className="bg-white p-5 rounded-2xl border border-[#e8dcc8]">
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(t.stars)].map((_, s) => (
                      <Star key={s} size={14} className="text-[#d4a84b] fill-[#d4a84b]" />
                    ))}
                  </div>
                  <p className="text-[#3d2c1e] text-sm mb-3">"{t.text}"</p>
                  <p className="font-semibold text-[#3d2c1e] text-sm">{t.name}</p>
                  <p className="text-[#6b5a4a] text-xs">{t.role}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-3xl font-bold text-center mb-4">
              Planos feitos para você
            </h2>
            <p className="text-center text-[#6b5a4a] mb-6 text-sm sm:text-base">
              Escolha o que melhor se encaixa no seu negócio
            </p>
          </FadeInSection>

          {/* Toggle */}
          <FadeInSection delay={0.1} className="flex justify-center mb-8">
            <div className="bg-[#fdf8f3] rounded-full p-1 flex border border-[#e8dcc8]">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 sm:px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === "monthly" ? "bg-[#eebf9c] text-[#3d2c1e]" : "text-[#6b5a4a]"}`}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-4 sm:px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === "annual" ? "bg-[#eebf9c] text-[#3d2c1e]" : "text-[#6b5a4a]"}`}
              >
                Anual <span className="text-xs opacity-80">(20% off)</span>
              </button>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {plans.map((plan, i) => (
              <FadeInSection key={i} delay={0.1 + i * 0.1}>
                <div className={`relative bg-white rounded-2xl p-5 sm:p-6 border-2 ${plan.popular ? 'border-[#eebf9c]' : 'border-[#e8dcc8]'} h-full`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full bg-[#eebf9c] text-[#3d2c1e] text-xs font-bold">
                        Mais escolhido
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-[#3d2c1e] mb-1">{plan.name}</h3>
                  <p className="text-xs sm:text-sm text-[#6b5a4a] mb-4">{plan.desc}</p>
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-[#3d2c1e]">R$ {plan.price}</span>
                      <span className="text-[#6b5a4a] text-sm">{plan.priceLabel}</span>
                    </div>
                    {plan.annualLabel && <p className="text-xs text-[#d4a84b] mt-1">{plan.annualLabel}</p>}
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-xs sm:text-sm text-[#3d2c1e]">
                        <Check size={14} className="text-[#d4a84b] shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={goToSignup}
                    className={`w-full py-3 rounded-full font-bold text-sm ${plan.popular ? 'bg-[#eebf9c] hover:bg-[#d4a84b] text-[#3d2c1e]' : 'bg-[#fdf8f3] border border-[#e8dcc8] text-[#3d2c1e] hover:bg-[#f5dcc3]'}`}
                  >
                    {plan.cta}
                  </button>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4 bg-[#eebf9c]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-bold text-[#3d2c1e] mb-3">
            Pronto para transformar seu salão?
          </h2>
          <p className="text-[#3d2c1e]/80 mb-6 text-sm sm:text-base">
            Comece seu teste gratuito de 30 dias.
          </p>
          <button
            onClick={goToSignup}
            className="bg-[#3d2c1e] text-white px-8 py-4 rounded-full font-bold text-sm sm:text-base shadow-lg"
          >
            Criar conta gratuita
          </button>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <FadeInSection>
            <h2 className="text-xl sm:text-3xl font-bold text-center mb-8">
              Perguntas frequentes
            </h2>
          </FadeInSection>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FaqItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-[#3d2c1e]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Logo" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-[#f5dcc3]">Gende</span>
          </div>
          <div className="flex gap-4 text-xs sm:text-sm">
            <a href="/pricing" className="text-[#f5dcc3]/70 hover:text-[#f5dcc3]">Preços</a>
            <a href="/features" className="text-[#f5dcc3]/70 hover:text-[#f5dcc3]">Recursos</a>
            <a href="/support" className="text-[#f5dcc3]/70 hover:text-[#f5dcc3]">Suporte</a>
            <a href="/politica-de-privacidade" className="text-[#f5dcc3]/70 hover:text-[#f5dcc3]">Privacidade</a>
          </div>
          <p className="text-[#f5dcc3]/50 text-xs">© {new Date().getFullYear()} Gende</p>
        </div>
      </footer>

      {/* Mobile CTA Fixed */}
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:hidden bg-white border-t border-[#e8dcc8] z-40">
        <button
          onClick={goToSignup}
          className="w-full bg-[#eebf9c] text-[#3d2c1e] py-3 rounded-full font-bold"
        >
          Começar agora
        </button>
      </div>
    </div>
  );
};

export default Landing;