"use client";

import { useState } from "react";
import { Loader2, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createLead,
  SERVICE_TYPE_OPTIONS,
  URGENCY_OPTIONS,
  SOURCE_OPTIONS,
  type CreateLeadPayload,
} from "@/lib/leads";

interface NewLeadFormProps {
  onCreated: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

const INITIAL: CreateLeadPayload = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  service_type: "",
  urgency: "soon",
  source: "manual",
  notes: "",
};

export function NewLeadForm({ onCreated, onToast }: NewLeadFormProps) {
  const [form, setForm] = useState<CreateLeadPayload>({ ...INITIAL });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function set(field: keyof CreateLeadPayload, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    const result = await createLead(form);
    setSubmitting(false);

    if (result.success) {
      onToast("Lead created successfully", "success");
      setForm({ ...INITIAL });
      setErrors({});
      onCreated();
    } else {
      onToast(result.error || "Failed to create lead", "error");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-5 py-4 text-left md:cursor-default"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/10">
            <Plus className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className="text-sm font-semibold text-white">New Lead</h2>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform md:hidden",
            !collapsed && "rotate-180"
          )}
        />
      </button>

      <form
        onSubmit={handleSubmit}
        className={cn(
          "space-y-4 px-5 pb-5 transition-all",
          collapsed && "hidden md:block"
        )}
      >
        {/* Full Name */}
        <Field label="Full Name" required error={errors.full_name}>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="John Smith"
            className={inputClass(errors.full_name)}
          />
        </Field>

        {/* Phone */}
        <Field label="Phone" required error={errors.phone}>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="(555) 123-4567"
            className={inputClass(errors.phone)}
          />
        </Field>

        {/* Email */}
        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="john@example.com"
            className={inputClass()}
          />
        </Field>

        {/* Address */}
        <Field label="Address">
          <input
            type="text"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="123 Main St"
            className={inputClass()}
          />
        </Field>

        {/* Service Type + Urgency — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service Type">
            <select
              value={form.service_type}
              onChange={(e) => set("service_type", e.target.value)}
              className={inputClass()}
            >
              <option value="">Select...</option>
              {SERVICE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Urgency">
            <select
              value={form.urgency}
              onChange={(e) => set("urgency", e.target.value)}
              className={inputClass()}
            >
              {URGENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Source */}
        <Field label="Source">
          <select
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
            className={inputClass()}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Any additional details..."
            rows={3}
            className={inputClass()}
          />
        </Field>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {submitting ? "Creating..." : "Create Lead"}
        </button>
      </form>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

function inputClass(error?: string) {
  return cn(
    "w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 transition-colors",
    "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
    error ? "border-red-500/50" : "border-white/10"
  );
}
