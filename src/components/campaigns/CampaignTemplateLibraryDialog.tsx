import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CampaignTemplate } from "@/types/whatsapp-campaigns";

export function CampaignTemplateLibraryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: CampaignTemplate[];
  onUseTemplate: (template: CampaignTemplate) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[30px] border-[#eadfce] bg-[#fffdf9] sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#3d2c1e]">Biblioteca de mensagens</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {props.templates.map((template) => (
            <div key={template.id} className="rounded-[24px] border border-[#eadfce] bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#3d2c1e]">{template.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#a67a44]">{template.objective}</p>
                </div>
                {template.is_system_template && <Badge variant="outline">Lis</Badge>}
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#6b5a4a]">{template.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {template.variables_json?.slice?.(0, 4)?.map?.((variable: string) => (
                  <span key={variable} className="rounded-full bg-[#f7f1e8] px-3 py-1 text-xs font-medium text-[#8a7b6d]">
                    {`{${variable}}`}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-[#8a7b6d]">Tom: {template.tone}</span>
                <Button
                  onClick={() => {
                    props.onUseTemplate(template);
                    props.onOpenChange(false);
                  }}
                  className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]"
                >
                  Usar modelo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
