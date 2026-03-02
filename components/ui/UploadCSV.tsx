"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  FileText,
  Loader2,
  X,
} from "lucide-react";

interface UploadResult {
  inserted: number;
  failed: { row: number; message: string }[];
  warnings: string[];
}

interface UploadCSVProps {
  companyId: string;
  onSuccess: (date: string) => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function UploadCSV({ companyId, onSuccess }: UploadCSVProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setState("idle");
    setResult(null);
    setError(null);
  }

  function clearFile() {
    setFile(null);
    setState("idle");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;

    setState("uploading");
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("company_id", companyId);

      const res = await fetch("/api/jobs/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setState("error");
        setError(json.error ?? "Upload failed");
        return;
      }

      setResult(json);
      setState("success");
      // Trigger optimization for the selected date
      onSuccess(date);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop zone / file selector */}
      <div
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors duration-200 cursor-pointer
          ${file
            ? "border-blue-500/50 bg-blue-500/5"
            : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
          }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {file ? (
          <>
            <FileText className="h-8 w-8 text-blue-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-white">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · Click to change
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="absolute top-3 right-3 rounded-full p-1 text-gray-500 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-gray-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-300">
                Click to select CSV
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Columns: job_date, technician_name, revenue_estimate, duration_estimate_hours, urgency
              </p>
            </div>
          </>
        )}
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-500 shrink-0">
          Schedule date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 [color-scheme:dark]"
        />
      </div>

      {/* Upload button */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || state === "uploading"}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-blue-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {state === "uploading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload & Analyze
          </>
        )}
      </button>

      {/* Result feedback */}
      <AnimatePresence mode="wait">
        {state === "success" && result && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-1"
          >
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">
                {result.inserted} job{result.inserted !== 1 ? "s" : ""} uploaded — running analysis…
              </span>
            </div>
            {result.failed.length > 0 && (
              <p className="text-xs text-orange-400 pl-6">
                {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} skipped (see console)
              </p>
            )}
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-500/20 bg-red-500/10 p-4"
          >
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
