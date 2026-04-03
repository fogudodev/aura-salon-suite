import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import { Plus, Clock, DollarSign, MoreVertical, Pencil, Trash2, Loader2, Download, Upload, Users, Search, Scissors, ChevronDown, Check } from "lucide-react";
import { exportToCSV, importCSVFile } from "@/lib/csv-utils";
import { useServices, useCreateService, useUpdateService, useDeleteService } from "@/hooks/useServices";
import { useSalonEmployees } from "@/hooks/useSalonEmployees";
import { useAllEmployeeServices } from "@/hooks/useEmployeeServices";
import { useProfessional } from "@/hooks/useProfessional";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { SERVICE_ICON_OPTIONS, getServiceIconOption } from "@/lib/service-icons";

type Service = Tables<"services">;
type ServiceWithMeta = Service & { maintenance_interval_days?: number | null; icon_key?: string | null };

const defaultForm = { name: "", duration_minutes: 30, price: 0, category: "Geral", active: true, description: "", maintenance_interval_days: 0, icon_key: "scissors" };

/** Combobox de categorias: lista existentes + permite criar nova */
const CategoryCombobox = ({ categories, value, onChange }: { categories: string[]; value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const filtered = inputValue.trim()
    ? categories.filter(c => c.toLowerCase().includes(inputValue.toLowerCase()))
    : categories;

  const showAddButton = inputValue.trim().length >= 2 && !categories.some(c => c.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <div className="space-y-1.5">
      <Label>Categoria</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-between w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background hover:bg-accent/5 transition-colors text-left"
            onClick={() => { setOpen(true); setInputValue(""); }}
          >
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {value || "Selecione a categoria"}
            </span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Buscar ou criar categoria..."
            className="mb-2 h-9 text-sm"
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => { onChange(cat); setOpen(false); }}
                className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  cat === value ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-secondary/60"
                }`}
              >
                {cat}
                {cat === value && <Check size={14} className="text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && !showAddButton && (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhuma categoria encontrada</p>
            )}
          </div>
          {showAddButton && (
            <button
              type="button"
              onClick={() => { onChange(inputValue.trim()); setOpen(false); }}
              className="flex items-center gap-2 w-full px-2.5 py-2 mt-1 rounded-md text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 transition-colors border border-dashed border-primary/30"
            >
              <Plus size={14} />
              Criar "{inputValue.trim()}"
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

const ServiceIconPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const selected = getServiceIconOption(value);

  return (
    <div className="space-y-1.5">
      <Label>Ícone do serviço</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/5"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg">
                {selected.emoji}
              </span>
              <span className="text-left">
                <span className="block font-medium text-foreground">{selected.label}</span>
                <span className="block text-xs text-muted-foreground">Escolha o ícone exibido no agendamento público</span>
              </span>
            </span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-3" align="start">
          <div className="grid grid-cols-4 gap-2">
            {SERVICE_ICON_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                className={`rounded-2xl border p-2.5 text-center transition-all ${
                  option.key === value
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/60 hover:border-primary/30 hover:bg-accent/5"
                }`}
              >
                <span className="mb-1 block text-2xl">{option.emoji}</span>
                <span className="block text-[11px] font-medium leading-tight text-foreground">{option.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

const Services = () => {
  const { data: services, isLoading } = useServices();
  const { data: professional } = useProfessional();
  const { data: employees } = useSalonEmployees();
  const { data: allEmployeeServices } = useAllEmployeeServices(professional?.id);
  const isSalon = professional?.account_type === "salon";
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const serviceEmployeeMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!allEmployeeServices || !employees) return map;
    for (const es of allEmployeeServices) {
      const emp = employees.find(e => e.id === es.employee_id);
      if (emp) {
        if (!map[es.service_id]) map[es.service_id] = [];
        map[es.service_id].push(emp.name);
      }
    }
    return map;
  }, [allEmployeeServices, employees]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const existingCategories = useMemo(() => [...new Set((services || []).map(s => s.category || "Geral"))], [services]);
  const categories = ["Todos", ...existingCategories];

  const filtered = useMemo(() => {
    let list = services || [];
    if (activeCategory !== "Todos") list = list.filter(s => s.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
    }
    return list;
  }, [services, activeCategory, search]);

  const activeCount = (services || []).filter(s => s.active).length;
  const totalCount = (services || []).length;

  const openCreate = () => { setEditing(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (s: Service) => {
    const service = s as ServiceWithMeta;
    setEditing(s);
    setForm({
      name: service.name,
      duration_minutes: service.duration_minutes,
      price: Number(service.price),
      category: service.category || "Geral",
      active: service.active,
      description: service.description || "",
      maintenance_interval_days: service.maintenance_interval_days || 0,
      icon_key: service.icon_key || "scissors",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      if (editing) {
        await updateService.mutateAsync({ id: editing.id, ...form } as TablesUpdate<"services"> & { id: string });
        toast.success("Serviço atualizado!");
      } else {
        await createService.mutateAsync(form as TablesInsert<"services">);
        toast.success("Serviço criado!");
      }
      setDialogOpen(false);
    } catch { toast.error("Erro ao salvar serviço"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteService.mutateAsync(deleteTarget.id);
      toast.success("Serviço excluído!");
    } catch { toast.error("Erro ao excluir serviço"); }
    setDeleteTarget(null);
  };

  const handleExport = () => {
    if (!services?.length) return;
    exportToCSV(services.map(s => ({
      nome: s.name,
      duracao_min: s.duration_minutes,
      preco: s.price,
      categoria: s.category || "Geral",
      ativo: s.active ? "Sim" : "Não",
      descricao: s.description || "",
    })), "servicos", [
      { key: "nome", label: "Nome" },
      { key: "duracao_min", label: "Duração (min)" },
      { key: "preco", label: "Preço" },
      { key: "categoria", label: "Categoria" },
      { key: "ativo", label: "Ativo" },
      { key: "descricao", label: "Descrição" },
    ]);
  };

  const handleImport = async () => {
    try {
      const rows = await importCSVFile();
      let count = 0;
      for (const row of rows) {
        const name = row["Nome"] || row["nome"] || "";
        if (!name) continue;
        await createService.mutateAsync({
          name,
          duration_minutes: Number(row["Duração (min)"] || row["duracao_min"] || 30),
          price: Number(row["Preço"] || row["preco"] || 0),
          category: row["Categoria"] || row["categoria"] || "Geral",
          active: (row["Ativo"] || row["ativo"] || "Sim").toLowerCase() !== "não",
          description: row["Descrição"] || row["descricao"] || "",
        });
        count++;
      }
      toast.success(`${count} serviço(s) importado(s)!`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar");
    }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout title="Serviços" subtitle="Gerencie seus serviços e preços">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Scissors size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-foreground">{totalCount}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ativos</p>
            <p className="text-lg font-bold text-foreground">{activeCount}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Inativos</p>
            <p className="text-lg font-bold text-foreground">{totalCount - activeCount}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <DollarSign size={18} className="text-accent" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Categorias</p>
            <p className="text-lg font-bold text-foreground">{categories.length - 1}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass-card rounded-xl p-3 md:p-4 mb-6 space-y-3">
        {/* Search + Actions row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar serviço..."
              className="pl-9 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="icon" onClick={handleExport} title="Exportar CSV" className="h-10 w-10">
              <Download size={16} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleImport} title="Importar CSV" className="h-10 w-10">
              <Upload size={16} />
            </Button>
            <Button onClick={openCreate} className="gap-2 gradient-primary text-primary-foreground font-semibold">
              <Plus size={16} />
              <span className="hidden sm:inline">Novo Serviço</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                cat === activeCategory
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Service list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={32} />
        </div>
      ) : !filtered?.length ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
            <Scissors size={28} className="text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground">Nenhum serviço encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Tente outra busca" : "Crie seu primeiro serviço clicando no botão acima"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((service, i) => {
            const icon = getServiceIconOption((service as ServiceWithMeta).icon_key, service.name, service.category);

            return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="glass-card rounded-xl p-4 hover:border-primary/20 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3 md:gap-4">
                {/* Icon */}
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  service.active ? "bg-primary/10" : "bg-muted/30"
                }`}>
                  <span className="text-xl">{icon.emoji}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{service.name}</h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      service.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}>
                      {service.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                    <span className="text-[10px] md:text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md">
                      {service.category || "Geral"}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>{service.duration_minutes} min</span>
                    </div>
                    {service.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px] md:max-w-[200px] hidden sm:inline">
                        {service.description}
                      </span>
                    )}
                  </div>

                  {/* Employees (salon only) */}
                  {isSalon && serviceEmployeeMap[service.id] && serviceEmployeeMap[service.id].length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Users size={11} className="text-muted-foreground flex-shrink-0" />
                      {serviceEmployeeMap[service.id].slice(0, 3).map((name) => (
                        <span key={name} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                          {name}
                        </span>
                      ))}
                      {serviceEmployeeMap[service.id].length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{serviceEmployeeMap[service.id].length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Price + Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm md:text-base font-bold text-primary">
                    {formatCurrency(Number(service.price))}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:bg-muted/50 transition-all">
                        <MoreVertical size={16} className="text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(service)}>
                        <Pencil size={14} className="mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(service)}>
                        <Trash2 size={14} className="mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize as informações do serviço" : "Preencha os dados do novo serviço"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Corte feminino" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço (R$)</Label>
                <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: +e.target.value }))} />
              </div>
            </div>
            <CategoryCombobox
              categories={existingCategories}
              value={form.category}
              onChange={(val) => setForm(f => ({ ...f, category: val }))}
            />
            <ServiceIconPicker
              value={form.icon_key}
              onChange={(iconKey) => setForm(f => ({ ...f, icon_key: iconKey }))}
            />
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo de Manutenção (dias)</Label>
              <Input type="number" min={0} value={form.maintenance_interval_days} onChange={e => setForm(f => ({ ...f, maintenance_interval_days: +e.target.value }))} placeholder="0 = sem manutenção" />
              <p className="text-[10px] text-muted-foreground">Defina para receber lembrete automático de retorno</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Ativo</Label>
            </div>
            <Button
              onClick={handleSave}
              disabled={createService.isPending || updateService.isPending}
              className="w-full gradient-primary text-primary-foreground font-semibold"
            >
              {(createService.isPending || updateService.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Services;
