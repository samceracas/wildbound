import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { LoginRequestSchema, type LoginRequest } from "@wildbound/shared";
import { Shell, Wordmark } from "@/components/layout/Shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useLogin, useMe } from "@/lib/queries.ts";

/**
 * Step 1 of 2: register (or resume) a researcher by username.
 *
 * react-hook-form + zod: the SAME LoginRequestSchema the API validates with, so
 * the client and server rules can never drift apart.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const form = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema), defaultValues: { username: "" } });

  if (me.data) return <Navigate to="/location" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate("/location");
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Could not log in" });
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <Shell>
      <header className="bg-deep-forest px-6 pt-10 pb-8">
        <Wordmark />
        <h1 className="text-display mt-8 text-paper">Begin your field survey</h1>
        <p className="mt-3 text-paper/75">
          Every Wildkin you observe is recorded under your researcher name. Use the same name to continue later.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="text-label-lg text-ink">
            Researcher name
          </label>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="e.g. sam_field"
            aria-invalid={errors.username ? true : undefined}
            {...form.register("username")}
          />
          <p className={errors.username ? "text-sm text-terracotta" : "text-sm text-ink-muted"}>
            {errors.username?.message ?? "3–20 letters, numbers or underscores."}
          </p>
        </div>

        {errors.root && <p className="rounded-md bg-terracotta/10 px-3 py-2 text-sm text-terracotta">{errors.root.message}</p>}

        <div className="mt-auto flex flex-col gap-3">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Opening your ledger…" : "Continue"}
          </Button>
          <p className="text-center text-xs text-ink-muted">Step 1 of 2 · Next: location sharing</p>
        </div>
      </form>
    </Shell>
  );
}
