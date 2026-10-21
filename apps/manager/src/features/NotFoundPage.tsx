import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-muted">404</p>
      <h1 className="font-serif text-xl">No entry on this page of the field guide.</h1>
      <Button asChild variant="outline">
        <Link to="/">Back to the dashboard</Link>
      </Button>
    </div>
  );
}
