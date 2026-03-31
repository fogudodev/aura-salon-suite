import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Menu, X, MessageCircle, Mail, Clock, ChevronDown, ArrowRight } from "lucide-react";
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

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-[#e8dcc8] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3">
        <span className="font-semibold text-[#3d2c1e]">{question}</span>
        <ChevronDown className={`w-5 h-5 text-[#6b5a4a] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-4 text-[#6b5a4a]">{answer}</div>}
    </div>
  );
};

const Support = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const navTo = (path: string) => { navigate(path); setMobileMenuOpen(false); };
  const goToSignup = () => { navigate("/auth?mode=signup"); setMobileMenuOpen(false); };

  const supportOptions = [
    { icon: MessageCircle, title: "WhatsApp", desc: "Resposta rápida pelo WhatsApp", action: "Enviar mensagem", href: "https://wa.me/55SEUNUMERO" },
    { icon: Mail, title: "Email", desc: "Respondemos em até 24h", action: "Enviar email", href: "mailto:suporte@gende.io" },
    { icon: Clock, title: "Horário", desc: "Seg a Sex, 9h às 18h", action: "", href: "#" },
  ];

  const faqs = [
    { q: "Como crio minha conta?", a: "Clique em 'Começar', preencha seus dados e pronto!" },
    { q: "Como conecto o WhatsApp?", a: "Nas configurações, vá em 'WhatsApp' e siga o passo a passo." },
    { q: "Funciona no celular?", a: "Sim! Perfeito no celular, tablet ou computador." },
    { q: "Tem teste grátis?", a: "Sim, 30 dias gratuitos com todas as funcionalidades." },
    { q: "Como cancelo?", a: "A qualquer momento, sem burocracia." },
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
            <button onClick={() => navTo("/features")} className="px-3 py-1.5 text-sm text-[#6b5a4a]">Recursos</button>
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
              <button onClick={() => navTo("/features")} className="text-left px-3 py-2 border-b border-[#e8dcc8]">Recursos</button>
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
              <MessageCircle className="w-4 h-4" /> Suporte
            </span>
          </FadeInSection>
          <FadeInSection delay={0.1}>
            <h1 className="text-2xl sm:text-4xl font-extrabold mb-4">Precisa de <span className="text-[#d4a84b]">ajuda?</span></h1>
          </FadeInSection>
          <FadeInSection delay={0.2}>
            <p className="text-[#6b5a4a] max-w-xl mx-auto mb-6">Estamos aqui para ajudar. Escolha o canal mais cómodo.</p>
          </FadeInSection>
        </div>
      </motion.section>

      {/* Contact Cards */}
      <section className="px-4 pb-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {supportOptions.map((opt, i) => (
            <FadeInSection key={i} delay={0.1 + i * 0.1}>
              <a href={opt.href} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-2xl p-5 border border-[#e8dcc8] hover:border-[#eebf9c] transition-all text-center">
                <div className="w-12 h-12 rounded-xl bg-[#f5dcc3] flex items-center justify-center mx-auto mb-3">
                  <opt.icon className="w-6 h-6 text-[#d4a84b]" />
                </div>
                <h3 className="font-bold mb-1">{opt.title}</h3>
                <p className="text-xs text-[#6b5a4a] mb-2">{opt.desc}</p>
                {opt.action && <span className="text-xs text-[#d4a84b] font-medium">→ {opt.action}</span>}
              </a>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="px-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-[#25D366] to-[#20BD5A] rounded-2xl p-6 sm:p-8 text-center text-white">
            <MessageCircle className="w-10 h-10 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Fale no WhatsApp</h2>
            <p className="text-white/90 mb-5">Resposta rápida, atendimento humanizado.</p>
            <a href="https://wa.me/55SEUNUMERO" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-[#25D366] px-6 py-3 rounded-full font-bold hover:bg-white/90">
              <MessageCircle className="w-5 h-5" /> Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-10 bg-white">
        <div className="max-w-3xl mx-auto">
          <FadeInSection><h2 className="text-xl font-bold text-center mb-8">Perguntas Frequentes</h2></FadeInSection>
          <div className="space-y-3">{faqs.map((faq, i) => <FAQItem key={i} question={faq.q} answer={faq.a} />)}</div>
        </div>
      </section>

      {/* Still Need Help */}
      <section className="px-4 py-10">
        <div className="max-w-3xl mx-auto text-center">
          <FadeInSection>
            <h2 className="text-xl font-bold mb-3">Ainda precisa de ajuda?</h2>
            <p className="text-[#6b5a4a] mb-5">Nossa equipe está pronta!</p>
            <a href="https://wa.me/55SEUNUMERO" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#eebf9c] text-[#3d2c1e] px-6 py-3 rounded-full font-bold hover:bg-[#d4a84b]">
              <MessageCircle className="w-5 h-5" /> Falar com suporte
            </a>
          </FadeInSection>
        </div>
      </section>

      <footer className="py-8 px-4 bg-[#3d2c1e]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2"><img src={logo} alt="Logo" className="w-7 h-7 rounded-lg" /><span className="font-bold text-[#f5dcc3]">Gende</span></div>
          <div className="flex gap-4 text-sm"><a href="/pricing" className="text-[#f5dcc3]/70">Preços</a><a href="/features" className="text-[#f5dcc3]/70">Recursos</a></div>
          <p className="text-[#f5dcc3]/50 text-xs">© {new Date().getFullYear()} Gende</p>
        </div>
      </footer>
    </div>
  );
};

export default Support;