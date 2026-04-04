import { useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useCourses, useCourseEnrollments } from "@/hooks/useCourses";
import { triggerCourseAutomation } from "@/hooks/useCourseAutomations";
import { useProfessional } from "@/hooks/useProfessional";
import { api } from "@/lib/api-client";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Award, Search, Download, Send, CheckCircle, Clock, FileText, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  not_issued: { label: "Não emitido", variant: "outline" },
  issued: { label: "Emitido", variant: "default" },
  sent: { label: "Enviado", variant: "secondary" },
};

const CourseCertificates = () => {
  const { data: professional } = useProfessional();
  const { courses } = useCourses();
  const { enrollments } = useCourseEnrollments();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issuing, setIssuing] = useState(false);

  const certificates = useQuery({
    queryKey: ["course-certificates", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("course_certificates")
        .select("*, course_enrollments(student_name, student_email, student_phone, course_id, class_id, courses(name), course_classes(name, class_date))")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  // Enrollments that don't have a certificate yet
  const eligibleEnrollments = useMemo(() => {
    const certEnrollmentIds = new Set((certificates.data || []).map((c: any) => c.enrollment_id));
    return (enrollments.data || []).filter(
      (e: any) => e.enrollment_status === "confirmed" && !certEnrollmentIds.has(e.id)
    );
  }, [enrollments.data, certificates.data]);

  const issueCertificate = useMutation({
    mutationFn: async (enrollmentIds: string[]) => {
      const inserts = enrollmentIds.map((eid) => ({
        enrollment_id: eid,
        professional_id: professional!.id,
        status: "issued",
        issued_at: new Date().toISOString(),
      }));
      const { error } = await api.from("course_certificates").insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_: unknown, enrollmentIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: ["course-certificates"] });
      setSelected(new Set());
      toast({ title: "Certificados emitidos com sucesso!" });

      if (professional?.id) {
        enrollmentIds.forEach((enrollmentId) => {
          triggerCourseAutomation({
            professionalId: professional.id,
            triggerType: "course_certificate_sent",
            enrollmentId,
            extraVars: {
              link_certificado: "",
            },
          });
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro ao emitir certificados", description: err.message, variant: "destructive" });
    },
  });

  const handleBatchIssue = () => {
    if (selected.size === 0) return;
    issueCertificate.mutate(Array.from(selected));
  };

  const handleIssueForEnrollment = (enrollmentId: string) => {
    issueCertificate.mutate([enrollmentId]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === eligibleEnrollments.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleEnrollments.map((e: any) => e.id)));
    }
  };

  const filteredCerts = (certificates.data || []).filter((c: any) => {
    const name = c.course_enrollments?.student_name || "";
    const matchSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === "all" || c.course_enrollments?.course_id === courseFilter;
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchCourse && matchStatus;
  });

  return (
    <DashboardLayout title="Certificados">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Award className="text-primary" size={28} />
              Certificados
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Emita e gerencie certificados dos seus cursos</p>
          </div>
        </div>

        {/* Eligible for issuance */}
        {eligibleEnrollments.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                Alunos aptos para certificado ({eligibleEnrollments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox checked={selected.size === eligibleEnrollments.length && eligibleEnrollments.length > 0} onCheckedChange={toggleSelectAll} />
                  <span className="text-xs text-muted-foreground">Selecionar todos</span>
                  {selected.size > 0 && (
                    <Button size="sm" onClick={handleBatchIssue} disabled={issueCertificate.isPending} className="ml-auto gap-1">
                      {issueCertificate.isPending ? <Loader2 className="animate-spin" size={14} /> : <Award size={14} />}
                      Emitir {selected.size} certificado{selected.size > 1 ? "s" : ""}
                    </Button>
                  )}
                </div>
                {eligibleEnrollments.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border">
                    <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.student_name}</p>
                      <p className="text-[10px] text-muted-foreground">{e.courses?.name} — {e.course_classes?.name}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleIssueForEnrollment(e.id)} className="gap-1 text-xs shrink-0">
                      <Award size={12} /> Emitir
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar aluno..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Curso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {(courses.data || []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="not_issued">Não emitido</SelectItem>
              <SelectItem value="issued">Emitido</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Certificates Table */}
        {certificates.isLoading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        ) : filteredCerts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Award size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum certificado encontrado</h3>
              <p className="text-muted-foreground text-sm">Emita certificados para alunos com inscrição confirmada</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead className="hidden sm:table-cell">Curso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Emitido em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCerts.map((cert: any) => {
                    const sc = statusConfig[cert.status] || statusConfig.not_issued;
                    return (
                      <TableRow key={cert.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{cert.course_enrollments?.student_name}</p>
                          <p className="text-[11px] text-muted-foreground">{cert.course_enrollments?.student_email}</p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          {cert.course_enrollments?.courses?.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {cert.issued_at ? format(new Date(cert.issued_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CourseCertificates;
