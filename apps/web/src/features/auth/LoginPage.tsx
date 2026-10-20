import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleCheck, IdCard } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { LoginRequestSchema, type LoginRequest } from "@wildbound/shared";
import { ConsoleButton, LcdScreen, Shell, Wordmark } from "@/components/layout/Shell.tsx";
import { PLAYER_HEAD } from "@/lib/assets.ts";
import { useLogin, useMe } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 20;

/**
 * Step 1 of 2: register (or resume) a researcher by username.
 * Layout: Stitch screen 1 "Register Username" (patches/0.1.0/mockups/1-login.html).
 *
 * react-hook-form + zod: the SAME LoginRequestSchema the API validates with, so
 * the client and server rules can never drift apart.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { username: "" },
    mode: "onChange",
  });

  if (me.data) return <Navigate to="/location" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate("/location");
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Could not log in" });
    }
  });

  const { errors, isSubmitting, dirtyFields } = form.formState;
  const length = form.watch("username").length;
  const valid = dirtyFields.username && !errors.username;

  return (
    <Shell>
      <p className="mt-2 mb-3 px-3 font-pixel text-[8px] tracking-widest text-chassis-text uppercase">Field archive / Mabunyi reg</p>

      <LcdScreen className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b-2 border-lcd-edge/40 pb-3">
          <Wordmark />
          <div className="min-w-0 flex-1 font-pixel">
            <p className="text-[8px] text-lcd-ink/70 uppercase">Wildbound field registry</p>
            <p className="mt-1 text-[10px]">Researcher ID</p>
          </div>
          <span className="font-pixel text-[9px] text-primary-forest">ONLINE</span>
        </div>

        <div className="text-center">
          <h1 className="font-pixel text-[13px] leading-5 tracking-tight">Choose a username</h1>
          <p className="mt-2 font-vt text-xl leading-5 text-lcd-ink/80">
            Your call-sign across field logs &amp; archives. Use the same one to continue your survey later.
          </p>
        </div>

        <div className="relative mx-auto">
          <div className="border-4 border-lcd-edge bg-paper p-1.5 shadow-[3px_3px_0_#27533c]">
            <img src={PLAYER_HEAD} alt="" className="pixelated size-24 bg-warm-paper" />
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-deep-forest px-1.5 py-0.5 font-pixel text-[7px] text-paper">
            RESEARCHER
          </span>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between font-pixel text-[8px]">
            <label htmlFor="username">Researcher call-sign</label>
            <span aria-live="polite">
              {length} / {MAX_LENGTH}
            </span>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 border-2 bg-[#f8fbf4] px-2 shadow-[inset_0_2px_3px_rgb(0_0_0/0.15)]",
              errors.username ? "border-terracotta" : "border-deep-forest",
            )}
          >
            <IdCard className="size-4 shrink-0 text-lcd-ink/70" aria-hidden />
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LENGTH}
              placeholder="sam_field"
              aria-invalid={errors.username ? true : undefined}
              aria-describedby="username-help"
              className="h-11 min-w-0 flex-1 bg-transparent font-pixel text-[12px] uppercase outline-none placeholder:text-lcd-ink/30"
              {...form.register("username")}
            />
          </div>
          <div id="username-help" className="flex items-start justify-between gap-2 font-vt text-lg leading-5">
            <p className={errors.username ? "text-terracotta" : "text-lcd-ink/70"}>
              {errors.username?.message ?? "3–20 letters, numbers or underscores."}
            </p>
            {valid && (
              <span className="flex shrink-0 items-center gap-1 text-success">
                <CircleCheck className="size-4" aria-hidden /> Valid
              </span>
            )}
          </div>

          {errors.root && (
            <p role="alert" className="border-2 border-terracotta bg-terracotta/10 px-2 py-1 font-vt text-lg text-terracotta">
              {errors.root.message}
            </p>
          )}

          <ConsoleButton face="A" type="submit" disabled={isSubmitting} trailing={<ArrowRight className="size-4" />} className="mt-2">
            {isSubmitting ? "Opening your ledger…" : "Confirm call-sign"}
          </ConsoleButton>
        </form>

        <div className="flex justify-between border-t-2 border-lcd-edge/40 pt-2 font-pixel text-[7px] text-lcd-ink/60 uppercase">
          <span>Step 1 of 2</span>
          <span>Next: location</span>
        </div>
      </LcdScreen>
    </Shell>
  );
}
