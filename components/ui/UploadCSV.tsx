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

const COLUMN_HINT =
  "Your CSV headers can be: Technician Name, Job ID, Job Name, Revenue, Duration (hrs), Urgency, Schedule Date";

interface UploadResult {
  inserted: number;
  updated?: number;
  rejectedRows?: { row: number; message: string }[];
  failed: { row: number; message: string }[];
  warnings: string[];
}

interface UploadErrorDetails {
  parsedRowCount?: number;
  headerRaw?: string[];
  headerNormalized?: string[];
  headerCanonical?: string[];
  requiredColumns?: string[];
  missingColumns?: string[];
  sampleRejections?: Array<{ row: number; reason: string }>;
}

interface UploadCSVProps {
  onSuccess: (date: string) => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function UploadCSV({ onSuccess }: UploadCSVProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<UploadErrorDetails | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setState("idle");
    setResult(null);
    setError(null);
    setErrorDetails(null);
  }

  function clearFile() {
    setFile(null);
    setState("idle");
    setResult(null);
    setError(null);
    setErrorDetails(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;

    setState("uploading");
    setError(null);
    setErrorDetails(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/jobs/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setState("error");
        setError(json.error ?? "Upload failed");
        setErrorDetails(json.details ?? null);
        return;
      }

      setResult(json);
      setState("success");
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
                {COLUMN_HINT}
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
                {result.inserted} job{result.inserted !== 1 ? "s" : ""} inserted
                {(result.updated ?? 0) > 0 ? `, ${result.updated} updated` : ""} — running analysis…
              </span>
            </div>
            {result.failed.length > 0 && (
              <p className="text-xs text-orange-400 pl-6">
                {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} skipped (see details below)
              </p>
            )}
            {result.failed.length > 0 && (
              <ul className="mt-2 space-y-0.5 pl-6">
                {result.failed.slice(0, 5).map((f, i) => (
                  <li key={i} className="text-xs text-orange-300/80">
                    Row {f.row}: {f.message}
                  </li>
                ))}
                {result.failed.length > 5 && (
                  <li className="text-xs text-gray-500">
                    …and {result.failed.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>

            {errorDetails && (
              <div className="space-y-2 text-xs">
                {/* Missing columns */}
                {errorDetails.missingColumns && errorDetails.missingColumns.length > 0 && (
                  <div>
                    <p className="text-orange-400 font-medium">Missing columns:</p>
                    <p className="text-orange-300/80 mt-0.5 font-mono">
                      {errorDetails.missingColumns.join(", ")}
                    </p>
                  </div>
                )}

                {/* Detected headers */}
                {errorDetails.headerRaw && errorDetails.headerRaw.length > 0 && (
                  <div>
                    <p className="text-gray-400 font-medium">Headers detected:</p>
                    <p className="text-gray-500 mt-0.5 font-mono truncate">
                      {errorDetails.headerRaw.join(", ")}
                    </p>
                  </div>
                )}

                {/* Sample rejections */}
                {errorDetails.sampleRejections && errorDetails.sampleRejections.length > 0 && (
                  <div>
                    <p className="text-orange-400 font-medium">
                      Row errors ({errorDetails.parsedRowCount} parsed):
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {errorDetails.sampleRejections.slice(0, 3).map((r, i) => (
                        <li key={i} className="text-orange-300/80">
                          Row {r.row}: {r.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Column hint */}
                <div className="pt-1 border-t border-red-500/20">
                  <p className="text-gray-500">
                    <span className="text-gray-400 font-medium">Accepted headers:</span>{" "}
                    {COLUMN_HINT}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
