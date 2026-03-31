import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, Clock, Users, MapPin, Monitor, Blend, Calendar, DollarSign, CheckCircle, Loader2, MessageCircle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const modalityLabel = (m: string) => m === "online" ? "Online" : m === "hybrid" ? "Híbrido" : "Presencial";
const modalityIcon = (m: string) => m === "online" ? <Monitor size={14} /> : m === "hybrid" ? <Blend size={14} /> : <MapPin size={14} />;

const PublicCourses = () => {
  const { slug } = useParams<{ slug: string }>();
  const [professional, setProfessional] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    student_name: "", student_phone: "", student_email: "",
    student_cpf: "", student_city: "", student_notes: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Find professional by slug
      const { data: prof } = await api
        .from("professionals")
        .select("*")
        .eq("slug", slug)
        .single();
      if (!prof) { setLoading(false); return; }
      setProfessional(prof);

      // Load active courses
      const { data: courseData } = await api
        .from("courses")
        .select("*")
        .eq("professional_id", prof.id)
        .eq("status", "active")
        .order("name");
      setCourses(courseData || []);

      // Load open classes
      const { data: classData } = await api
        .from("course_classes")
        .select("*")
        .eq("professional_id", prof.id)
        .in("status", ["open", "full"])
        .order("class_date");
      setClasses(classData || []);

      setLoading(false);
    };
    if (slug) load();
  }, [slug]);

  const handleEnroll = async () => {
    if (!form.student_name.trim() || !form.student_phone.trim() || !selectedClass) return;
    setSubmitting(true);

    // Use atomic RPC to prevent overbooking
    const { data: result, error } = await api.rpc("enroll_student_in_class" as any, {
      p_professional_id: professional.id,
      p_course_id: selectedCourse.id,
      p_class_id: selectedClass.id,
      p_student_name: form.student_name,
      p_student_phone: form.student_phone,
      p_student_email: form.student_email || null,
      p_student_cpf: form.student_cpf || null,
      p_student_city: form.student_city || null,
      p_student_notes: form.student_notes || null,
      p_origin: "public_page",
    });

    if (error) {
      toast.error("Erro ao processar inscrição");
    } else if (result && !result.success) {
      toast.error(result.error || "Erro ao processar inscrição");
    } else if (result?.waitlist) {
      toast.success("Você entrou na lista de espera!");
      setSuccess(true);
    } else {
      toast.success("Inscrição realizada com sucesso!");
      setSuccess(true);
      // Update local class state
      setClasses(prev => prev.map(c =>
        c.id === selectedClass.id
          ? { ...c, enrolled_count: c.enrolled_count + 1, status: c.enrolled_count + 1 >= c.max_students ? "full" : c.status }
          : c
      ));
    }
    setSubmitting(false);
  };

  const openEnrollment = (course: any, cls: any) => {
    setSelectedCourse(course);
    setSelectedClass(cls);
    setForm({ student_name: "", student_phone: "", student_email: "", student_cpf: "", student_city: "", student_notes: "" });
    setSuccess(false);
    setEnrollOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Página não encontrada</p>
      </div>
    );
  }

  const primaryColor = professional.primary_color || "#eebf9c";

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
          {professional.logo_url && (
            <img src={professional.logo_url} alt="" className="w-16 h-16 rounded-2xl mx-auto mb-4 object-cover shadow-lg" />
          )}
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-3">
            Cursos & Formações
          </h1>
          <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto">
            {professional.business_name || professional.name} — Aprenda com quem entende do assunto
          </p>
        </div>
      </div>

      {/* Course List */}
      <div className="max-w-4xl mx-auto px-4 -mt-8 sm:-mt-12 pb-16 space-y-6">
        {courses.length === 0 ? (
          <Card className="text-center p-12">
            <GraduationCap size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum curso disponível no momento</h3>
            <p className="text-muted-foreground text-sm">Volte em breve para conferir novidades!</p>
          </Card>
        ) : (
          courses.map((course: any) => {
            const courseClasses = classes.filter((c: any) => c.course_id === course.id);
            return (
              <Card key={course.id} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
                {course.cover_image_url && (
                  <div className="h-48 sm:h-56 overflow-hidden">
                    <img src={course.cover_image_url} alt={course.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground">{course.name}</h2>
                    {course.short_description && (
                      <p className="text-muted-foreground mt-1">{course.short_description}</p>
                    )}
                  </div>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      {modalityIcon(course.modality)} {modalityLabel(course.modality)}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <Clock size={12} /> {course.workload_hours}h
                    </Badge>
                    {course.has_certificate && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle size={12} /> Certificado
                      </Badge>
                    )}
                  </div>

                  {/* Full description */}
                  {course.full_description && (
                    <div className="prose prose-sm max-w-none text-muted-foreground">
                      <p className="whitespace-pre-line">{course.full_description}</p>
                    </div>
                  )}

                  {/* Syllabus */}
                  {course.syllabus && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 text-foreground">📚 Conteúdo Programático</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{course.syllabus}</p>
                    </div>
                  )}

                  {/* Materials & Prerequisites */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {course.materials_included && (
                      <div>
                        <h4 className="font-semibold text-xs text-foreground mb-1">🎁 Materiais Inclusos</h4>
                        <p className="text-xs text-muted-foreground">{course.materials_included}</p>
                      </div>
                    )}
                    {course.prerequisites && (
                      <div>
                        <h4 className="font-semibold text-xs text-foreground mb-1">📋 Pré-requisitos</h4>
                        <p className="text-xs text-muted-foreground">{course.prerequisites}</p>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-2 pt-2 border-t border-border">
                    <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                      R$ {Number(course.price).toFixed(2).replace(".", ",")}
                    </span>
                    {course.installments > 1 && (
                      <span className="text-sm text-muted-foreground">
                        ou {course.installments}x de R$ {(Number(course.price) / course.installments).toFixed(2).replace(".", ",")}
                      </span>
                    )}
                  </div>

                  {/* Available Classes */}
                  {courseClasses.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-foreground">📅 Turmas Disponíveis</h3>
                      {courseClasses.map((cls: any) => {
                        const remaining = cls.max_students - cls.enrolled_count;
                        const isFull = remaining <= 0;
                        const isAlmostFull = !isFull && remaining <= 3;
                        const occupancy = cls.max_students > 0 ? (cls.enrolled_count / cls.max_students) * 100 : 0;
                        return (
                          <div key={cls.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{cls.name}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} />
                                  {format(new Date(cls.class_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                                <span>{cls.start_time?.slice(0, 5)} - {cls.end_time?.slice(0, 5)}</span>
                                {cls.location && <span className="flex items-center gap-1"><MapPin size={11} /> {cls.location}</span>}
                              </div>
                              <div className="mt-1.5">
                                <Progress value={occupancy} className="h-1.5" />
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {isFull ? "Turma lotada" : isAlmostFull ? `⚡ Últimas ${remaining} vagas!` : `${remaining} vagas restantes`}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => openEnrollment(course, cls)}
                              variant={isFull ? "outline" : "default"}
                              className="shrink-0 gap-1"
                              style={!isFull ? { backgroundColor: primaryColor } : undefined}
                            >
                              {isFull ? "Lista de Espera" : "Inscrever"}
                              <ChevronRight size={14} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {courseClasses.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Nenhuma turma aberta no momento.</p>
                  )}

                  {/* WhatsApp CTA */}
                  {professional.phone && (
                    <div className="pt-2">
                      <a
                        href={`https://wa.me/55${professional.phone?.replace(/\D/g, "")}?text=Olá! Gostaria de saber mais sobre o curso: ${course.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                        style={{ color: primaryColor }}
                      >
                        <MessageCircle size={16} /> Tirar dúvidas no WhatsApp
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Enrollment Dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedClass && selectedClass.enrolled_count >= selectedClass.max_students
                ? "Lista de Espera"
                : "Inscrição"}
            </DialogTitle>
          </DialogHeader>
          {success ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle size={48} className="mx-auto text-success" />
              <h3 className="text-lg font-semibold">
                {selectedClass && selectedClass.enrolled_count >= selectedClass.max_students
                  ? "Você está na lista de espera!"
                  : "Inscrição realizada!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {selectedClass && selectedClass.enrolled_count >= selectedClass.max_students
                  ? "Avisaremos quando uma vaga abrir."
                  : "Entraremos em contato para confirmar sua inscrição e pagamento."}
              </p>
              <Button onClick={() => setEnrollOpen(false)} variant="outline">Fechar</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                <p className="font-semibold">{selectedCourse?.name}</p>
                <p className="text-muted-foreground text-xs">
                  {selectedClass?.name} — {selectedClass?.class_date && format(new Date(selectedClass.class_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div>
                <Label>Nome completo *</Label>
                <Input value={form.student_name} onChange={(e) => setForm(p => ({ ...p, student_name: e.target.value }))} />
              </div>
              <div>
                <Label>WhatsApp *</Label>
                <Input value={form.student_phone} onChange={(e) => setForm(p => ({ ...p, student_phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.student_email} onChange={(e) => setForm(p => ({ ...p, student_email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CPF</Label>
                  <Input value={form.student_cpf} onChange={(e) => setForm(p => ({ ...p, student_cpf: e.target.value }))} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.student_city} onChange={(e) => setForm(p => ({ ...p, student_city: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.student_notes} onChange={(e) => setForm(p => ({ ...p, student_notes: e.target.value }))} rows={2} />
              </div>
              <Button onClick={handleEnroll} disabled={submitting || !form.student_name || !form.student_phone} className="w-full gap-2" style={{ backgroundColor: primaryColor }}>
                {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
                {selectedClass && selectedClass.enrolled_count >= selectedClass.max_students
                  ? "Entrar na Lista de Espera"
                  : "Confirmar Inscrição"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicCourses;
