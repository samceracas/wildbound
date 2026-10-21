import type { AssistResponse, WildkinEntryData } from "@wildbound/shared";
import { InfoIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssist, useManagerConfig } from "@/lib/queries";
import { assistContext, fieldLabel } from "@/lib/wildkin-form";
import { ErrorNotice } from "./common";

/**
 * "Describe your Wildkin idea" → POST /assist with the current form values →
 * the suggestion is merged into the form by `onApply` (which returns the fields it changed).
 */
export function AssistPanel({
  getValues,
  onApply,
}: {
  getValues: () => WildkinEntryData;
  onApply: (res: AssistResponse) => string[];
}) {
  const config = useManagerConfig();
  const assist = useAssist();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{ res: AssistResponse; applied: string[] } | null>(null);
  const enabled = config.data?.assistant.enabled ?? false;
  const tooShort = prompt.trim().length < 3;

  const run = () => {
    setResult(null);
    assist.mutate(
      { prompt: prompt.trim(), current: assistContext(getValues()) },
      { onSuccess: (res) => setResult({ res, applied: onApply(res) }) },
    );
  };

  return (
    <section className="rounded-lg border border-accent/25 bg-gradient-to-br from-accent/[0.07] via-panel to-panel">
      <header className="flex items-center gap-2 border-b border-accent/15 px-5 py-3">
        <SparklesIcon className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">AI field assistant</h2>
        <span className="text-xs text-muted">Drafts lore-aligned fields from the Wildbound docs. Review before saving.</span>
        {config.data?.assistant.model ? (
          <Badge variant="outline" className="ml-auto font-mono">
            {config.data.assistant.model}
          </Badge>
        ) : null}
      </header>
      <div className="space-y-3 p-5">
        <Textarea
          aria-label="Describe your Wildkin idea"
          placeholder="Describe your Wildkin idea, e.g. “a shy moth that pollinates night-blooming vines by the creek”…"
          value={prompt}
          maxLength={2000}
          disabled={!enabled}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && enabled && !tooShort && !assist.isPending) run();
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={!enabled || tooShort || assist.isPending}>
            {assist.isPending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {assist.isPending ? "Thinking…" : "Generate with AI"}
          </Button>
          {!enabled && config.isSuccess ? (
            <span className="text-xs text-warning">AI assist is off. Set GROQ_API_KEY in .env and restart the API.</span>
          ) : (
            <span className="text-xs text-faint">Fills empty and existing fields; you can still edit everything. Ctrl+Enter to run.</span>
          )}
        </div>

        <ErrorNotice error={assist.error} title="The assistant could not answer" />

        {result ? (
          <div className="space-y-2 rounded-md border border-line bg-field/60 p-3 text-sm">
            <p className="text-muted">
              {result.applied.length ? (
                <>
                  Updated <span className="text-fg">{result.applied.length}</span> fields:{" "}
                  {result.applied.map(fieldLabel).join(", ")}.
                </>
              ) : (
                "The assistant did not suggest any changes."
              )}{" "}
              <span className="font-mono text-xs text-faint">({result.res.model})</span>
            </p>
            {result.res.notes.length ? (
              <ul className="space-y-1">
                {result.res.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-fg/90">
                    <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-info" />
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.res.dropped.length ? (
              <p className="text-xs text-warning">
                Dropped invalid suggestions for: {result.res.dropped.map(fieldLabel).join(", ")}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
