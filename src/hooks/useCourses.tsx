import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import { toast } from "@/hooks/use-toast";
import { triggerCourseAutomation } from "./useCourseAutomations";

export const useCourses = () => {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const courses = useQuery({
    queryKey: ["courses", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("courses")
        .select("*, course_categories(name)")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  const createCourse = useMutation({
    mutationFn: async (course: any) => {
      const { data, error } = await api
        .from("courses")
        .insert({ ...course, professional_id: professional!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Curso criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar curso", description: error.message, variant: "destructive" });
    },
  });

  const updateCourse = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await api
        .from("courses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Curso atualizado!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar curso", description: error.message, variant: "destructive" });
    },
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Curso removido!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover curso", description: error.message, variant: "destructive" });
    },
  });

  return { courses, createCourse, updateCourse, deleteCourse };
};

export const useCourseClasses = (courseId?: string) => {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const classes = useQuery({
    queryKey: ["course-classes", professional?.id, courseId],
    queryFn: async () => {
      let query = api
        .from("course_classes")
        .select("*, courses(name)")
        .eq("professional_id", professional!.id)
        .order("class_date", { ascending: true });
      if (courseId) query = query.eq("course_id", courseId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  const createClass = useMutation({
    mutationFn: async (cls: any) => {
      const { data, error } = await api
        .from("course_classes")
        .insert({ ...cls, professional_id: professional!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["course-classes"] });
      toast({ title: "Turma criada com sucesso!" });

      if (professional?.id && data?.id && data.course_id) {
        try {
          const { data: waitlistEntries } = await api
            .from("course_waitlist")
            .select("id, name, phone, course_classes!inner(course_id)")
            .eq("professional_id", professional.id)
            .eq("course_classes.course_id", data.course_id)
            .eq("notified", false);

          const recipients = Array.from(new Map(
            (waitlistEntries || [])
              .filter((entry: any) => entry.phone)
              .map((entry: any) => [entry.phone, { name: entry.name, phone: entry.phone }])
          ).values());

          if (recipients.length > 0) {
            triggerCourseAutomation({
              professionalId: professional.id,
              triggerType: "course_waitlist_new_class",
              classId: data.id,
              recipients,
              extraVars: {
                turma: data.name || "",
                data: data.class_date ? new Date(data.class_date).toLocaleDateString("pt-BR") : "",
                horario: data.start_time || "",
                local: data.location || "",
                link_aula: data.online_link || "",
              },
            });
          }
        } catch (error) {
          console.error("Course waitlist automation error:", error);
        }
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar turma", description: error.message, variant: "destructive" });
    },
  });

  const updateClass = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data: previousClass, error: previousError } = await api
        .from("course_classes")
        .select("class_date, start_time, status")
        .eq("id", id)
        .single();
      if (previousError) throw previousError;

      const { data, error } = await api
        .from("course_classes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return {
        ...data,
        __previous_class_date: previousClass?.class_date || null,
        __previous_start_time: previousClass?.start_time || null,
        __previous_status: previousClass?.status || null,
      };
    },
    onSuccess: (data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["course-classes"] });
      toast({ title: "Turma atualizada!" });
      // Trigger automation if class was cancelled or rescheduled
      if (professional?.id && data?.id) {
        if (variables.status === "cancelled" && variables.status !== data.__previous_status) {
          triggerCourseAutomation({
            professionalId: professional.id,
            triggerType: "course_cancelled",
            classId: data.id,
            extraVars: { turma: data.name || "", curso: (data as any)?.courses?.name || "" },
          });
        }
        if (
          (variables.class_date && variables.class_date !== data.__previous_class_date) ||
          (variables.start_time && variables.start_time !== data.__previous_start_time)
        ) {
          const rescheduledDate = variables.class_date || data.class_date;
          const newDate = rescheduledDate ? new Date(rescheduledDate).toLocaleDateString("pt-BR") : "";
          triggerCourseAutomation({
            professionalId: professional.id,
            triggerType: "course_rescheduled",
            classId: data.id,
            extraVars: { turma: data.name || "", data: newDate, horario: variables.start_time || data.start_time || "" },
          });
        }
      }
    },
  });

  const deleteClass = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from("course_classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-classes"] });
      toast({ title: "Turma removida!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover turma", description: error.message, variant: "destructive" });
    },
  });

  return { classes, createClass, updateClass, deleteClass };
};

export const useCourseEnrollments = (classId?: string) => {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const enrollments = useQuery({
    queryKey: ["course-enrollments", professional?.id, classId],
    queryFn: async () => {
      let query = api
        .from("course_enrollments")
        .select("*, courses(name), course_classes(name, class_date)")
        .eq("professional_id", professional!.id)
        .order("enrolled_at", { ascending: false });
      if (classId) query = query.eq("class_id", classId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  const createEnrollment = useMutation({
    mutationFn: async (enrollment: any) => {
      const { data, error } = await api
        .from("course_enrollments")
        .insert({ ...enrollment, professional_id: professional!.id })
        .select()
        .single();
      if (error) throw error;
      // Update enrolled_count
      if (enrollment.class_id) {
        const { data: cls } = await api
          .from("course_classes")
          .select("enrolled_count, max_students")
          .eq("id", enrollment.class_id)
          .single();
        if (cls) {
          const newCount = (cls.enrolled_count || 0) + 1;
          await api
            .from("course_classes")
            .update({
              enrolled_count: newCount,
              status: newCount >= cls.max_students ? "full" : "open",
            })
            .eq("id", enrollment.class_id);
        }
      }
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["course-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["course-classes"] });
      toast({ title: "Inscrição realizada!" });
      // Trigger enrollment confirmation automation
      if (professional?.id && data?.id) {
        const course = (data as any)?.courses?.name || "";
        triggerCourseAutomation({
          professionalId: professional.id,
          triggerType: "course_enrollment_confirmed",
          enrollmentId: data.id,
          extraVars: { curso: course },
        });
      }
    },
  });

  const updateEnrollment = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await api
        .from("course_enrollments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["course-enrollments"] });
      toast({ title: "Inscrição atualizada!" });
      // Trigger payment confirmation if payment_status changed to paid
      if (professional?.id && variables.payment_status === "paid" && data?.id) {
        triggerCourseAutomation({
          professionalId: professional.id,
          triggerType: "course_payment_confirmed",
          enrollmentId: data.id,
          extraVars: { valor: String(variables.amount_paid || data.amount_paid || 0) },
        });
      }
      // Trigger enrollment confirmation if status changed to confirmed
      if (professional?.id && variables.enrollment_status === "confirmed" && data?.id) {
        triggerCourseAutomation({
          professionalId: professional.id,
          triggerType: "course_enrollment_confirmed",
          enrollmentId: data.id,
        });
      }
    },
  });

  return { enrollments, createEnrollment, updateEnrollment };
};
