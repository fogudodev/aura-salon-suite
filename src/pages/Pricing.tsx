import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Menu, X, Star, Check, X as XIcon, ChevronDown, ArrowRight } from "lucide-react";
import logo from "@/assets/logo-circle.png";

const COLORS = {
  primary: "#eebf9c",
  primaryDark: "#d4a84b",
  text: "#3d2c1e",
  textLight: "#6b5a4a",
  background: "#fdf8f3",
  white: "#ffffff",
  border: "#e8dcc8",
};

const FadeInSection = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay }} className={className}>
      {children}
    </motion.div>
  );
};

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-[#e8dcc8] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3">
        <span className="font-semibold text-[#3d2c1e] text-sm">{question}</span>
        <ChevronDown className={`w-5 h-5 text-[#6b5a4a] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-4 text-[#6b5a4a] text-sm">{answer}</div>}
    </div>
  );
};

const Pricing = () => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const navTo = (path: string) => { navigate(path); setMobileMenuOpen(false); };
  const goToSignup = () => { navigate("/auth?mode=signup"); setMobileMenuOpen(false); };

  const plans = [
    {
      name: "Essencial",
      desc: "Perfeito para autônomos",
      price: billingCycle === "monthly" ? "49,90" : "41,66",
      features: ["Agendamentos ilimitados", "Serviços ilimitados", "Clientes ilimitados", "WhatsApp automático", "Relatórios completos", "Página pública", "Suporte prioritário"],
      notIncluded: ["Múltiplos profissionais", "Comissões", "Fidelidade"],
      popular: true,
    },
    {
      name: "Enterprise",
      desc: "Para salões com equipe",
      price: billingCycle === "monthly" ? "99,90" : "83,25",
      features: ["5 profissionais", "Comissões automatizadas", "Fidelidade completa", "Google Calendar", "Assistente IA", "WhatsApp ilimitado", "Suporte VIP 24/7"],
      notIncluded: [],
      popular: false,
    },
  ];

  const features = [
    { category: "Agendamento", items: [
      { name: "Agenda 24/7", essential: true, enterprise: true },
      { name: "Link compartilhável", essential: true, enterprise: true },
      { name: "Pagamento de sinal", essential: true, enterprise: true },
    ]},
    { category: "Clientes", items: [
      { name: "Cadastro completo", essential: true, enterprise: true },
      { name: "Programa fidelidade", essential: false, enterprise: true },
      { name: "Segmentação", essential: true, enterprise: true },
    ]},
    { category: "Automação", items: [
      { name: "Lembretes WhatsApp", essential: true, enterprise: true },
      { name: "Campanhas em massa", essential: true, enterprise: true },
      { name: "Upsell automático", essential: false, enterprise: true },
    ]},
    { category: "Financeiro", items: [
      { name: "Relatórios", essential: true, enterprise: true },
      { name: "Comissões", essential: false, enterprise: true },
      { name: "Caixa", essential: true, enterprise: true },
    ]},
  ];

  const faqs = [
    { q: "Como funciona o teste?", a: "30 dias gratuitos para testar tudo." },
    { q: "Quais formas de pagamento?", a: "PIX, cartão ou Boleto." },
    { q: "Posso cancelar?", a: "Sim, a qualquer momento." },
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
            <button onClick={() => navTo("/features")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e]">Recursos</button>
            <button onClick={() => navTo("/support")} className="px-3 py-1.5 text-sm text-[#6b5a4a] hover:text-[#3d2c1e]">Suporte</button>
            <button onClick={() => navTo("/auth")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Entrar</button>
            <button onClick={goToSignup} className="bg-[#eebf9c] px-4 py-1.5 rounded-full text-sm font-bold">Começar</button>
          </div>
          <button onClick={goToSignup} className="sm:hidden bg-[#eebf9c] px-3 py-1.5 rounded-full text-sm font-bold">Começar</button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-t border-[#e8dcc8] py-3 px-4">
            <div className="flex flex-col gap-2">
              <button onClick={() => navTo("/")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Início</button>
              <button onClick={() => navTo("/features")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Recursos</button>
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
              <Star className="w-4 h-4" /> Planos claros
            </span>
          </FadeInSection>
          <FadeInSection delay={0.1}>
            <h1 className="text-2xl sm:text-4xl font-extrabold mb-4">Escolha o plano ideal</h1>
          </FadeInSection>
          <FadeInSection delay={0.2}>
            <p className="text-[#6b5a4a] mb-6">30 dias de teste gratuito. Sem compromisso.</p>
          </FadeInSection>
          <FadeInSection delay={0.3}>
            <div className="flex justify-center mb-6">
              <div className="bg-white rounded-full p-1 flex border border-[#e8dcc8]">
                <button onClick={() => setBillingCycle("monthly")} className={`px-5 py-2 rounded-full text-sm font-medium ${billingCycle === "monthly" ? "bg-[#eebf9c]" : "text-[#6b5a4a]"}`}>Mensal</button>
                <button onClick={() => setBillingCycle("annual")} className={`px-5 py-2 rounded-full text-sm font-medium ${billingCycle === "annual" ? "bg-[#eebf9c]" : "text-[#6b5a4a]"}`}>Anual (20% off)</button>
              </div>
            </div>
          </FadeInSection>
        </div>
      </motion.section>

      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5">
          {plans.map((plan, i) => (
            <FadeInSection key={i} delay={0.1 + i * 0.1}>
              <div className={`relative bg-white rounded-2xl p-5 border-2 ${plan.popular ? 'border-[#eebf9c]' : 'border-[#e8dcc8]'} h-full`}>
                {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-4 py-1 rounded-full bg-[#eebf9c] text-xs font-bold">Mais escolhido</span></div>}
                <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                <p className="text-xs text-[#6b5a4a] mb-4">{plan.desc}</p>
                <div className="mb-4"><span className="text-3xl font-bold">R$ {plan.price}</span><span className="text-[#6b5a4a] text-sm">/mês</span></div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, fi) => (<li key={fi} className="flex items-center gap-2 text-xs"><Check className="w-4 h-4 text-[#d4a84b]" /><span>{f}</span></li>))}
                  {plan.notIncluded.map((f, fi) => (<li key={fi} className="flex items-center gap-2 text-xs text-[#a0a0a0]"><XIcon className="w-4 h-4" /><span className="line-through">{f}</span></li>))}
                </ul>
                <button onClick={goToSignup} className={`w-full py-3 rounded-full font-bold text-sm ${plan.popular ? 'bg-[#eebf9c]' : 'bg-[#fdf8f3] border border-[#e8dcc8]'}`}>Assinar</button>
              </div>
            </FadeInSection>
          ))}
        </div>
      </section>

      <section className="px-4 py-10 bg-white">
        <div className="max-w-5xl mx-auto">
          <FadeInSection><h2 className="text-xl font-bold text-center mb-8">Compare os recursos</h2></FadeInSection>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead><tr className="border-b border-[#e8dcc8]"><th className="text-left py-3 px-4 font-semibold">Recurso</th><th className="text-center py-3 px-4 font-semibold">Essencial</th><th className="text-center py-3 px-4 font-semibold text-[#d4a84b]">Enterprise</th></tr></thead>
              <tbody>
                {features.map((section, si) => (
                  <React.Fragment key={si}>
                    <tr className="bg-[#f5dcc3]/30"><td colSpan={3} className="py-2 px-4 font-bold text-sm">{section.category}</td></tr>
                    {section.items.map((item, ii) => (
                      <tr key={ii} className="border-b border-[#e8dcc8]/50">
                        <td className="py-3 px-4 text-sm text-[#6b5a4a]">{item.name}</td>
                        <td className="text-center py-3 px-4">{item.essential ? <Check className="w-4 h-4 text-[#d4a84b] mx-auto" /> : <XIcon className="w-4 h-4 text-[#ccc] mx-auto" />}</td>
                        <td className="text-center py-3 px-4">{item.enterprise ? <Check className="w-4 h-4 text-[#d4a84b] mx-auto" /> : <XIcon className="w-4 h-4 text-[#ccc] mx-auto" />}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <FadeInSection><h2 className="text-xl font-bold text-center mb-8">Perguntas frequentes</h2></FadeInSection>
          <div className="space-y-3">{faqs.map((faq, i) => <FAQItem key={i} question={faq.q} answer={faq.a} />)}</div>
        </div>
      </section>

      <section className="px-4 py-12 bg-[#eebf9c]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold text-[#3d2c1e] mb-3">Comece grátis</h2>
          <p className="text-[#3d2c1e]/80 mb-6">30 dias de teste. Sem compromisso.</p>
          <button onClick={goToSignup} className="bg-[#3d2c1e] text-white px-8 py-4 rounded-full font-bold">Criar conta gratuita</button>
        </div>
      </section>

      <footer className="py-8 px-4 bg-[#3d2c1e]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2"><img src={logo} alt="Logo" className="w-7 h-7 rounded-lg" /><span className="font-bold text-[#f5dcc3]">Gende</span></div>
          <div className="flex gap-4 text-sm"><a href="/features" className="text-[#f5dcc3]/70">Recursos</a><a href="/support" className="text-[#f5dcc3]/70">Suporte</a></div>
          <p className="text-[#f5dcc3]/50 text-xs">© {new Date().getFullYear()} Gende</p>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;