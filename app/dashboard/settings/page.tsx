"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Input } from "@/components/ui-kit";
import { toast } from "sonner";

const settingsSchema = z.object({
  appName: z.string().min(2),
  heartbeatInterval: z.number().min(5).max(300),
  notifyEmail: z.string().email(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { register, handleSubmit, formState } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appName: "Nexora-API",
      heartbeatInterval: 30,
      notifyEmail: "ops@aovpro.com",
    },
  });

  const onSubmit = () => {
    toast.success("Đã lưu settings");
  };

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">General, security, license rules, server monitoring.</p>
      </Card>
      <Card>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm">App name</label>
            <Input {...register("appName")} />
            <p className="text-xs text-red-400">{formState.errors.appName?.message}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm">Heartbeat interval (seconds)</label>
            <Input type="number" {...register("heartbeatInterval", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Notify email</label>
            <Input type="email" {...register("notifyEmail")} />
          </div>
          <Button type="submit">Save settings</Button>
        </form>
      </Card>
    </div>
  );
}
