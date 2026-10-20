import { Navigate, Outlet } from "react-router";
import { Shell } from "@/components/layout/Shell.tsx";
import { useMe } from "@/lib/queries.ts";

/** Lets children render only with a logged-in player. */
export function RequireSession() {
  const me = useMe();
  if (me.isPending) {
    return (
      <Shell className="items-center justify-center">
        <p className="font-pixel text-[9px] text-chassis-text">OPENING YOUR LEDGER…</p>
      </Shell>
    );
  }
  if (me.isError) {
    return (
      <Shell className="items-center justify-center p-6 text-center">
        <p className="font-vt text-xl text-[#f0a596]">Cannot reach the Wildbound API. Is `pnpm dev:api` running?</p>
      </Shell>
    );
  }
  return me.data ? <Outlet /> : <Navigate to="/" replace />;
}
