import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Phone, CheckCircle2, X } from "lucide-react";
import logo from "@/assets/logo-circle.png";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

type AuthMode = "login" | "signup";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [accountType, setAccountType] = useState<"autonomous" | "salon">("autonomous");
  const [employeeCount, setEmployeeCount] = useState(1);
  const [mode, setMode] = useState<AuthMode>(() => {
    return searchParams.get("mode") === "signup" ? "signup" : "login";
  });
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "signup") setMode("signup");
  }, [searchParams]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.slice(0, 13);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw === "") {
      setPhone("");
      return;
    }
    let formatted = raw;
    if (!formatted.startsWith("55")) {
      formatted = "55" + formatted;
    }
    setPhone(formatPhone(formatted));
  };

  const displayPhone = (value: string) => {
    if (!value) return "";
    const d = value;
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)} (${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
    return `${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
    } else {
      // Check if user is admin/support and redirect accordingly
      try {
        const { data: { session } } = await api.auth.getSession();
        const roles: string[] = (session?.user as any)?.app_metadata?.roles || [];
        if (roles.includes("admin") || roles.includes("support")) {
          navigate("/admin");
        } else {
          navigate("/");
        }
      } catch {
        navigate("/");
      }
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 12) {
      toast.error("Informe um número de WhatsApp válido com DDD");
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, name, accountType, businessName || undefined, phone || undefined);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Show success modal
    setShowSuccessModal(true);
    setLoading(false);

    // Send notification to admin WhatsApp (fire and forget)
    api.functions.invoke("notify-signup", {
      body: { name, businessName, email, phone },
    }).catch((err) => console.error("Notify signup error:", err));
  };

  const inputClass = "bg-white border-[#e8dcc8] text-[#3d2c1e] placeholder:text-[#6b5a4a] rounded-full py-3 px-6 text-base h-auto focus:border-[#eebf9c] focus:ring-[#eebf9c] transition-all duration-300";

  return (
    <div className="min-h-screen bg-[#fdf8f3] text-[#3d2c1e] flex flex-col relative overflow-hidden">
      {/* Wavy SVG Divider */}
      <div className="absolute top-0 left-0 w-full pointer-events-none">
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-[45vh] block">
          <path d="M0,400 L0,0 L1440,0 L1440,400 C1300,320 1100,380 800,300 C500,220 200,340 0,400 Z" fill="#eebf9c" fillOpacity="0.15" />
        </svg>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowSuccessModal(false);
              setMode("login");
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white border border-[#e8dcc8] rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setMode("login");
                }}
                className="absolute top-4 right-4 text-[#6b5a4a] hover:text-[#3d2c1e] transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-5">
                  <CheckCircle2 className="text-green-500" size={36} />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold mb-3">
                  Conta criada com sucesso! 🎉
                </h2>

                <p className="text-[#6b5a4a] text-sm sm:text-base leading-relaxed mb-2">
                  Verifique seu email para confirmar sua conta.
                </p>

                <div className="bg-[#eebf9c]/10 border border-[#eebf9c]/20 rounded-2xl p-4 mt-3 w-full">
                  <p className="text-sm font-medium text-[#3d2c1e]">
                    📱 Em instantes, um analista entrará em contato pelo seu WhatsApp para ajudar na configuração do seu espaço.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setMode("login");
                  }}
                  className="w-full rounded-full py-3 h-auto text-base font-semibold bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b] mt-6 border border-[#e8dcc8]"
                >
                  Entendido!
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <AnimatePresence mode="wait">
          {mode === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md"
            >
              <div className="flex items-center mb-12">
                <img src={logo} alt="Gende" className="w-12 h-12 rounded-2xl shadow-lg" />
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-10 tracking-tight">Entrar</h1>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className={`${inputClass} md:py-4 md:px-8 md:text-lg`}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className={`${inputClass} md:py-4 md:px-8 md:text-lg pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-[#6b5a4a] hover:text-[#3d2c1e] transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full py-3 md:py-4 h-auto text-base md:text-lg font-semibold bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b] transition-all duration-300 mt-4 border border-[#e8dcc8]"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#3d2c1e]/30 border-t-[#3d2c1e] rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowRight size={18} />
                      Entrar
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-[#6b5a4a] mt-8 text-sm">
                Ainda não tem conta?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-[#d4a84b] hover:underline font-medium"
                >
                  Criar conta
                </button>
              </p>
            </motion.div>
          )}

          {mode === "signup" && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md"
            >
              <div className="flex items-center mb-6">
                <img src={logo} alt="Gende" className="w-12 h-12 rounded-2xl shadow-lg" />
              </div>

              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Criar sua conta</h1>
              <p className="text-sm text-[#6b5a4a] mb-6">
                Preencha seus dados e comece a organizar seu negócio.
              </p>

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Nome completo</Label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Nome do Studio ou Salão</Label>
                  <Input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ex: Studio da Maria"
                    required
                    className={inputClass}
                  />
                </div>

                {/* Account type selection */}
                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Como você trabalha?</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAccountType("autonomous"); setEmployeeCount(1); }}
                      className={`flex-1 rounded-full py-2.5 px-4 text-sm font-medium border transition-all duration-200 ${
                        accountType === "autonomous"
                          ? "bg-[#eebf9c] text-[#3d2c1e] border-[#eebf9c]"
                          : "bg-white border-[#e8dcc8] text-[#6b5a4a] hover:bg-[#f5dcc3]"
                      }`}
                    >
                      👩‍💼 Trabalho sozinha
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType("salon")}
                      className={`flex-1 rounded-full py-2.5 px-4 text-sm font-medium border transition-all duration-200 ${
                        accountType === "salon"
                          ? "bg-[#eebf9c] text-[#3d2c1e] border-[#eebf9c]"
                          : "bg-white border-[#e8dcc8] text-[#6b5a4a] hover:bg-[#f5dcc3]"
                      }`}
                    >
                      💇‍♀️ Salão / Equipe
                    </button>
                  </div>
                </div>

                {accountType === "salon" && (
                  <div className="space-y-2">
                    <Label className="text-[#6b5a4a] text-sm pl-2">Quantos profissionais trabalham com você?</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={employeeCount}
                        onChange={(e) => setEmployeeCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                        className={`${inputClass} w-24 text-center`}
                      />
                      <span className="text-sm text-[#6b5a4a]">cadeira(s) / profissional(is)</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">WhatsApp</Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b5a4a]">
                      <Phone size={16} />
                    </div>
                    <Input
                      type="tel"
                      value={displayPhone(phone)}
                      onChange={handlePhoneChange}
                      placeholder="55 (11) 99999-9999"
                      required
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  <p className="text-[11px] text-[#6b5a4a] pl-2">
                    O DDI 55 é adicionado automaticamente. Enviaremos uma mensagem de boas-vindas!
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#6b5a4a] text-sm pl-2">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      className={`${inputClass} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-[#6b5a4a] hover:text-[#3d2c1e] transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full py-3 h-auto text-base font-semibold bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b] transition-all duration-300 mt-2 border border-[#e8dcc8]"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#3d2c1e]/30 border-t-[#3d2c1e] rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowRight size={18} />
                      Criar conta
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-[#6b5a4a] mt-6 text-sm">
                Já tem conta?{" "}
                <button
                  onClick={() => setMode("login")}
                  className="text-[#d4a84b] hover:underline font-medium"
                >
                  Fazer login
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Auth;
