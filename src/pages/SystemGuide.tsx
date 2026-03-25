import { useState, useEffect, useRef, useMemo } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search, ArrowUp, ChevronRight, ChevronDown, BookOpen, Rocket,
  HelpCircle, Zap, CheckCircle, AlertTriangle, Lightbulb, Info,
  Star, ArrowLeft, X, ExternalLink, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  categories, quickStartSteps, quickTutorials, faqs,
  type GuideCategory, type GuideFunction
} from "@/lib/guide-data";
import { motion, AnimatePresence } from "framer-motion";

// ─── Callout Boxes ───
const TipBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 p-3 md:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
    <Lightbulb className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
    <div className="text-sm text-foreground/90">{children}</div>
  </div>
);

const WarningBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 p-3 md:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
    <div className="text-sm text-foreground/90">{children}</div>
  </div>
);

const InfoBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 p-3 md:p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
    <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
    <div className="text-sm text-foreground/90">{children}</div>
  </div>
);

// ─── Numbered Step ───
const NumberedStep = ({ number, text }: { number: number; text: string }) => (
  <div className="flex gap-3 items-start">
    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
      {number}
    </span>
    <span className="text-sm text-foreground/80 pt-0.5">{text}</span>
  </div>
);

// ─── Function Detail Modal/Expanded ───
const FunctionDetail = ({ func, onClose }: { func: GuideFunction; onClose: () => void }) => {
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detailRef.current?.scrollTo(0, 0);
  }, [func.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="space-y-6"
      ref={detailRef}
    >
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">{func.title}</h2>
        <p className="text-muted-foreground mt-2">{func.description}</p>
      </div>

      {/* Why Important */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          Por que é importante?
        </h3>
        <p className="text-sm text-foreground/80">{func.whyImportant}</p>
      </div>

      {/* When to Use */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Quando usar?
        </h3>
        <p className="text-sm text-foreground/80">{func.whenToUse}</p>
      </div>

      {/* Problems Solved */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">Problemas que resolve</h3>
        <div className="grid gap-2">
          {func.problemsSolved.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/80">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Benefits */}
      <TipBox>
        <p className="font-semibold mb-2">Benefícios práticos:</p>
        <ul className="space-y-1">
          {func.benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-500">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </TipBox>

      {/* How to Configure */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">🔧 Como configurar</h3>
        <div className="space-y-2">
          {func.howToConfigure.map((step, i) => (
            <NumberedStep key={i} number={i + 1} text={step} />
          ))}
        </div>
      </div>

      {/* How to Use */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">📋 Como usar no dia a dia</h3>
        <div className="space-y-2">
          {func.howToUse.map((step, i) => (
            <NumberedStep key={i} number={i + 1} text={step} />
          ))}
        </div>
      </div>

      {/* Tips */}
      <TipBox>
        <p className="font-semibold mb-2">💡 Dicas importantes:</p>
        <ul className="space-y-1">
          {func.tips.map((t, i) => (
            <li key={i}>• {t}</li>
          ))}
        </ul>
      </TipBox>

      {/* Best Practices */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Boas práticas
        </h3>
        <div className="grid gap-2">
          {func.bestPractices.map((bp, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/80">{bp}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Common Errors */}
      <WarningBox>
        <p className="font-semibold mb-2">⚠️ Erros comuns a evitar:</p>
        <ul className="space-y-1">
          {func.commonErrors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      </WarningBox>

      {/* Important Notes */}
      {func.importantNotes.length > 0 && (
        <InfoBox>
          <p className="font-semibold mb-2">ℹ️ Observações importantes:</p>
          <ul className="space-y-1">
            {func.importantNotes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        </InfoBox>
      )}

      {/* Expected Result */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
            🎯 Resultado esperado
          </h3>
          <p className="text-sm text-foreground/80">{func.expectedResult}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const CATEGORY_TO_FLAG: Record<string, string> = {
  "agenda": "bookings",
  "clientes": "clients",
  "servicos": "services",
  "equipe": "team",
  "financeiro": "finance",
  "estoque": "products",
  "whatsapp": "whatsapp_automations",
  "automacao": "whatsapp_automations",
  "relatorios": "reports",
  "pagina-online": "public_page",
  "ia": "ai_assistant",
  "campanhas": "campaigns",
  "avaliacoes": "reviews",
  "cupons": "coupons",
  "instagram-dm": "instagram_dm",
  "gende-rewards": "gende_rewards",
  "cursos": "courses",
  "upsell-inteligente": "upsell_inteligente",
};

// ─── Main Page ───
const SystemGuide = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFunction, setActiveFunction] = useState<GuideFunction | null>(null);
  const [activeSection, setActiveSection] = useState<"home" | "quickstart" | "tutorials" | "faq" | "category">("home");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: globalFlags } = useFeatureFlags();

  const globalFlagMap = useMemo(() => {
    const map = new Map<string, boolean>();
    (globalFlags || []).forEach((f) => map.set(f.key, f.enabled));
    return map;
  }, [globalFlags]);

  const isCategoryDisabled = (catId: string): boolean => {
    const flagKey = CATEGORY_TO_FLAG[catId];
    if (!flagKey) return false;
    if (globalFlagMap.has(flagKey)) return !globalFlagMap.get(flagKey)!;
    return false;
  };

  // Filter categories based on feature flags
  const enabledCategories = useMemo(() => {
    return categories.filter((cat) => !isCategoryDisabled(cat.id));
  }, [globalFlagMap]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return enabledCategories;
    const q = search.toLowerCase();
    return enabledCategories
      .map((cat) => ({
        ...cat,
        functions: cat.functions.filter(
          (f) =>
            f.title.toLowerCase().includes(q) ||
            f.summary.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.functions.length > 0 || cat.title.toLowerCase().includes(q));
  }, [search, enabledCategories]);

  const filteredFAQs = useMemo(() => {
    if (!search.trim()) return faqs;
    const q = search.toLowerCase();
    return faqs.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
  }, [search]);

  const openCategory = (catId: string) => {
    setActiveCategory(catId);
    setActiveFunction(null);
    setActiveSection("category");
    scrollToTop();
  };

  const openFunction = (func: GuideFunction) => {
    setActiveFunction(func);
    scrollToTop();
  };

  const goHome = () => {
    setActiveSection("home");
    setActiveCategory(null);
    setActiveFunction(null);
    setSearch("");
    scrollToTop();
  };

  const currentCategory = enabledCategories.find((c) => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-10 space-y-6 md:space-y-8">

        {/* ─── Breadcrumb ─── */}
        <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground flex-wrap">
          <button onClick={goHome} className="hover:text-foreground transition-colors">
            Guia
          </button>
          {activeSection === "quickstart" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Comece por aqui</span>
            </>
          )}
          {activeSection === "tutorials" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Tutoriais rápidos</span>
            </>
          )}
          {activeSection === "faq" && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Perguntas frequentes</span>
            </>
          )}
          {activeSection === "category" && currentCategory && (
            <>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => { setActiveFunction(null); scrollToTop(); }}
                className="hover:text-foreground transition-colors"
              >
                {currentCategory.title}
              </button>
              {activeFunction && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground">{activeFunction.title}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* ─── Hero Section ─── */}
        {activeSection === "home" && !activeFunction && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/10 p-6 md:p-10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
            <div className="relative z-10 space-y-4 md:space-y-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/20">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <Badge variant="secondary" className="text-xs">Central de Conhecimento</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
                Guia Completo do Sistema
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
                Tudo o que você precisa saber para dominar cada funcionalidade do sistema.
                Aprenda a configurar, utilizar e extrair o máximo de cada recurso disponível.
              </p>

              {/* Search */}
              <div className="relative max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar funcionalidades, termos ou dúvidas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-background/80 backdrop-blur-sm border-border/50 h-11"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              {/* Quick Nav */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setActiveSection("quickstart"); scrollToTop(); }}
                  className="gap-1.5 text-xs"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Comece por aqui
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setActiveSection("tutorials"); scrollToTop(); }}
                  className="gap-1.5 text-xs"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Tutoriais rápidos
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setActiveSection("faq"); scrollToTop(); }}
                  className="gap-1.5 text-xs"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Perguntas frequentes
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Search bar when not home ─── */}
        {activeSection !== "home" && (
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        )}

        {/* ─── Categories Grid (Home) ─── */}
        {activeSection === "home" && !activeFunction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-5"
          >
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {search ? `Resultados para "${search}"` : "Explorar por categoria"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Card
                    key={cat.id}
                    className="group cursor-pointer hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                    onClick={() => openCategory(cat.id)}
                  >
                    <CardContent className="p-4 md:p-5 space-y-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                        cat.color
                      )}>
                        <Icon className="h-5 w-5 text-foreground/80" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm md:text-base">
                          {cat.title}
                        </h3>
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                          {cat.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {cat.functions.length} {cat.functions.length === 1 ? "artigo" : "artigos"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredCategories.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum resultado encontrado para "{search}"</p>
                <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="mt-2">
                  Limpar busca
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ─── Quick Start Section ─── */}
        {activeSection === "quickstart" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/20">
                  <Rocket className="h-5 w-5 text-primary" />
                </div>
                Comece por aqui
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Siga esta ordem para configurar seu sistema rapidamente e começar a operar.
              </p>
            </div>

            <div className="relative">
              {/* Progress line */}
              <div className="absolute left-5 top-8 bottom-8 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent hidden md:block" />

              <div className="space-y-4">
                {quickStartSteps.map((item) => (
                  <Card key={item.step} className="relative overflow-hidden">
                    <CardContent className="p-4 md:p-5 flex gap-4 items-start">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0 z-10">
                        {item.step}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm md:text-base">{item.title}</h3>
                        <p className="text-xs md:text-sm text-muted-foreground mt-1">{item.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <TipBox>
              Após completar esses 8 passos, seu sistema estará 100% operacional e pronto para receber clientes!
            </TipBox>
          </motion.div>
        )}

        {/* ─── Quick Tutorials ─── */}
        {activeSection === "tutorials" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/20">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                Tutoriais Rápidos
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Atalhos práticos para as tarefas mais comuns do dia a dia.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {quickTutorials.map((tut) => {
                const Icon = tut.icon;
                return (
                  <Card key={tut.title} className="hover:border-primary/30 transition-all">
                    <CardContent className="p-4 md:p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground text-sm">{tut.title}</h3>
                      </div>
                      <div className="space-y-1.5">
                        {tut.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-xs text-foreground/80">{step}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ─── FAQ ─── */}
        {activeSection === "faq" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/20">
                  <HelpCircle className="h-5 w-5 text-primary" />
                </div>
                Perguntas Frequentes
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Respostas rápidas para as dúvidas mais comuns.
              </p>
            </div>

            <div className="space-y-3">
              {filteredFAQs.map((faq, i) => (
                <FAQItem key={i} question={faq.question} answer={faq.answer} />
              ))}
              {filteredFAQs.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma pergunta encontrada para "{search}"
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Category Detail ─── */}
        {activeSection === "category" && currentCategory && !activeFunction && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
                currentCategory.color
              )}>
                <currentCategory.icon className="h-6 w-6 text-foreground/80" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground">{currentCategory.title}</h2>
                <p className="text-sm text-muted-foreground">{currentCategory.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              {currentCategory.functions.map((func) => (
                <Card
                  key={func.id}
                  className="group cursor-pointer hover:border-primary/30 transition-all duration-300 hover:shadow-md"
                  onClick={() => openFunction(func)}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm md:text-base">
                          {func.title}
                        </h3>
                        <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{func.summary}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-xs gap-1 text-muted-foreground group-hover:text-primary"
                      >
                        Ver detalhes
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick nav to other categories */}
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Outras categorias</h3>
              <div className="flex flex-wrap gap-2">
                {categories
                  .filter((c) => c.id !== activeCategory)
                  .map((cat) => (
                    <Button
                      key={cat.id}
                      variant="outline"
                      size="sm"
                      onClick={() => openCategory(cat.id)}
                      className="text-xs gap-1.5"
                    >
                      <cat.icon className="h-3.5 w-3.5" />
                      {cat.title}
                    </Button>
                  ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Function Detail ─── */}
        {activeSection === "category" && activeFunction && (
          <AnimatePresence mode="wait">
            <FunctionDetail
              key={activeFunction.id}
              func={activeFunction}
              onClose={() => { setActiveFunction(null); scrollToTop(); }}
            />
          </AnimatePresence>
        )}

        {/* ─── Scroll to Top ─── */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToTop}
              className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 p-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow"
            >
              <ArrowUp className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ─── FAQ Accordion Item ───
const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card
      className={cn(
        "transition-all duration-200 cursor-pointer",
        open && "border-primary/20 shadow-sm"
      )}
      onClick={() => setOpen(!open)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-foreground">{question}</span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-sm text-muted-foreground mt-3 ml-7">{answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};

export default SystemGuide;
