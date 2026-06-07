"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGraphStore } from "@/lib/graphStore";
import { Upload, FileJson, ArrowRight, Code2, Sparkles, GitBranch, Eye } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const setGraphData = useGraphStore((s) => s.setGraphData);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Basic validation
        if (!data.meta || !data.nodes || !data.edges) {
          throw new Error(
            "Invalid graph.json: missing meta, nodes, or edges fields."
          );
        }

        setGraphData(data);
        router.push("/graph");
      } catch (err) {
        setError(
          err instanceof SyntaxError
            ? "Invalid JSON file. Please upload a valid graph.json."
            : err instanceof Error
              ? err.message
              : "Failed to load file."
        );
        setIsLoading(false);
      }
    },
    [setGraphData, router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleLoadDemo = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/graph.json");
      if (!res.ok) throw new Error("Demo graph.json not found in /public folder.");
      const data = await res.json();
      setGraphData(data);
      router.push("/graph");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo.");
      setIsLoading(false);
    }
  }, [setGraphData, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      {/* Background glow effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a2e] border border-[#2a2a3d] text-xs text-[#9898a6] mb-6">
            <Sparkles size={12} className="text-purple-400" />
            Static analysis powered by TypeScript AST
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              NextVis
            </span>
          </h1>

          <p className="text-lg text-[#9898a6] max-w-lg mx-auto leading-relaxed">
            Visualize your Next.js codebase as an interactive dependency graph.
            Drop your <code className="px-1.5 py-0.5 rounded bg-[#1a1a2e] text-purple-300 text-sm font-mono">graph.json</code> to explore.
          </p>
        </div>

        {/* Upload zone */}
        <div
          className={`upload-zone ${isDragOver ? "drag-over" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleInputChange}
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-[#9898a6]">Loading graph data...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-[#2a2a3d] flex items-center justify-center">
                <Upload size={28} className="text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-semibold mb-1">
                  Drop graph.json here
                </p>
                <p className="text-sm text-[#6b6b7b]">
                  or click to browse · JSON files only
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Demo button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleLoadDemo}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1a1a2e] border border-[#2a2a3d] text-sm text-[#9898a6] hover:text-white hover:border-blue-500/50 hover:bg-[#1e1e2d] transition-all duration-200 disabled:opacity-50"
          >
            <FileJson size={16} />
            Load demo graph
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-3 mt-12">
          <div className="p-4 rounded-xl bg-[#12121a] border border-[#1e1e2d]">
            <GitBranch size={20} className="text-blue-400 mb-2" />
            <h3 className="text-sm font-semibold mb-1">Barrel Resolution</h3>
            <p className="text-xs text-[#6b6b7b] leading-relaxed">
              Multi-hop barrel files resolved to real definitions.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#12121a] border border-[#1e1e2d]">
            <Eye size={20} className="text-green-400 mb-2" />
            <h3 className="text-sm font-semibold mb-1">Edge Classification</h3>
            <p className="text-xs text-[#6b6b7b] leading-relaxed">
              Render, call, import-only, and dynamic import edges.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#12121a] border border-[#1e1e2d]">
            <Code2 size={20} className="text-purple-400 mb-2" />
            <h3 className="text-sm font-semibold mb-1">RSC Aware</h3>
            <p className="text-xs text-[#6b6b7b] leading-relaxed">
              Client vs server component boundaries clearly marked.
            </p>
          </div>
        </div>

        {/* CLI instructions */}
        <div className="mt-8 p-4 rounded-xl bg-[#12121a] border border-[#1e1e2d]">
          <p className="text-xs text-[#6b6b7b] mb-2">Generate graph.json from your project:</p>
          <code className="block text-sm font-mono text-purple-300 bg-[#0a0a0f] px-3 py-2 rounded-lg">
            npm run build &amp;&amp; npm run scan -- ./my-nextjs-app
          </code>
        </div>
      </div>
    </div>
  );
}
