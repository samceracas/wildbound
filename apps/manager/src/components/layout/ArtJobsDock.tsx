import { CheckCircle2Icon, Loader2Icon, OctagonXIcon, WandSparklesIcon, XCircleIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { asErrorInfo } from "@/features/wildkin/common";
import { cancelArtJob, dismissArtJob, setArtJobMinimized, useArtJobs, type ArtJob } from "@/lib/art-jobs";
import { cn } from "@/lib/utils";

/**
 * Minimized PixelLab generations, bottom-right on every page: elapsed time while
 * running, then the outcome. "Open" goes to the Wildkin and shows the dialog
 * again; finished jobs can be dismissed.
 */
export function ArtJobsDock() {
  const jobs = useArtJobs().filter((j) => j.minimized);
  const { pathname } = useLocation();
  if (jobs.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-40 flex w-80 flex-col gap-2" aria-live="polite">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} here={pathname === `/wildkin/${job.id}`} />
      ))}
    </div>
  );
}

function JobCard({ job, here }: { job: ArtJob; here: boolean }) {
  const running = job.status === "running";
  const elapsed = useElapsed(job);
  const what = job.kinds.join(" + ");
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-lg border bg-panel p-3 shadow-xl shadow-black/40",
        job.status === "failed" ? "border-danger/50" : job.status === "done" ? "border-accent/50" : "border-line",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          {running ? (
            <Loader2Icon className="size-4 animate-spin text-gold" />
          ) : job.status === "done" ? (
            <CheckCircle2Icon className="size-4 text-accent" />
          ) : job.status === "failed" ? (
            <XCircleIcon className="size-4 text-danger" />
          ) : (
            <OctagonXIcon className="size-4 text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {job.name} <span className="font-normal text-muted">· {what}</span>
          </p>
          <p className="text-xs text-muted">
            {running
              ? `Generating with PixelLab… ${elapsed}`
              : job.status === "done"
                ? `Done in ${elapsed}`
                : job.status === "failed"
                  ? asErrorInfo(job.error).message
                  : "Cancelled. Nothing was saved."}
          </p>
        </div>
        {!running ? (
          <button
            type="button"
            className="rounded p-0.5 text-faint hover:bg-panel-2 hover:text-fg"
            aria-label="Dismiss"
            onClick={() => dismissArtJob(job.id)}
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {running ? (
          <Button size="sm" variant="destructive-ghost" onClick={() => cancelArtJob(job.id)}>
            Cancel
          </Button>
        ) : null}
        {here ? (
          <Button size="sm" variant="outline" onClick={() => setArtJobMinimized(job.id, false)}>
            <WandSparklesIcon /> Show
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to={`/wildkin/${job.id}`} state={{ openArt: true }}>
              <WandSparklesIcon /> Open
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** "1:05" since the job started (ticking while it runs). */
function useElapsed(job: ArtJob): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (job.status !== "running") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [job.status]);
  const ms = (job.finishedAt ?? now) - job.startedAt;
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
