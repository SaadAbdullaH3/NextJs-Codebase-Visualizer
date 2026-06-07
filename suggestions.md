# AI Tool Prompt — Strategic Suggestions & Guardrails
> Include this alongside the master prompts to provide additional strategic context and guardrails for the AI agent.

## 1. Stretch Feature: Safe LLM Integration
While core correctness is the priority, the assessment explicitly encourages using LLMs for "semantic clustering" and "plain-English module descriptions." 
**Directive for AI:** Once the core AST-based graph is 100% functional, implement the "plain-English explainer side panel" as a stretch feature. Add a button in the UI (`NodeSidebar.tsx`) that passes the selected module's raw code to an LLM endpoint to generate a quick summary. This demonstrates a deep understanding of *where* to safely apply AI (for plain-text summarization) versus where to avoid it (deterministic AST parsing).

## 2. Advanced Next.js Route Visualization
The assessment strictly requires identifying parallel and intercepting routes. 
**Directive for AI:** In the `React Flow` UI implementation, do not just group all layouts and routing nodes under a generic color. Add explicit visual badging or specific iconography inside the custom nodes for `@parallel` and `(..)intercepting` directory patterns. Assessors must immediately see that these complex Next.js routing nuances are distinctly handled in the UI.

## 3. Sample Output Validation
The assessment rubric explicitly requires a link to a sample output on a real public codebase inside the README.
**Directive for AI:** Ensure the final CLI build script or README generation prompt leaves a hardcoded placeholder/reminder to include a hosted `graph.json` link based on the chosen test repository (e.g., `vercel/commerce`). The CLI tool must be tested to ensure it can gracefully ingest and parse this specific repository without crashing.

## 4. AI Workflow Writeup Authenticity (Human-in-the-Loop)
**Directive for AI:** Do NOT auto-generate the "rejected or corrected AI output" examples for the final 1-2 page AI workflow write-up. The human developer must document genuine mistakes, bugs, or hallucinations encountered during the 5-day build process. Provide only the structural outline for the write-up; leave the exact prompt failures (e.g., barrel resolution infinite loops, AST dynamic import misses) blank for the human to fill in. This ensures authenticity and prepares the candidate for the 15% reasoning interview.
