import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_PATTERNS,
  GAME_FIELDS,
  MOVEMENT_STYLES,
  PUBLISH_REQUIRED_FIELDS,
  RARITIES,
  WildkinEntryInputSchema,
  type ActivityPattern,
  type AssistResponse,
  type MovementStyle,
  type Rarity,
  type WildkinEntry,
  type WildkinEntryData,
} from "@wildbound/shared";
import {
  ArrowLeftIcon,
  CircleDotIcon,
  GamepadIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
  type Path,
  type Resolver,
} from "react-hook-form";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateWildkin,
  usePublishWildkin,
  useRestoreWildkin,
  useStats,
  useUpdateWildkin,
  useWildkinEntry,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  emptyEntry,
  entryToFormValues,
  fieldLabel,
  formatRegistryNumber,
  slugify,
  suggestionUpdates,
} from "@/lib/wildkin-form";
import { ArtPanel } from "./ArtPanel";
import { AssistPanel } from "./AssistPanel";
import { DeleteWildkinDialog } from "./DeleteWildkinDialog";
import { GamePreview } from "./GamePreview";
import { asErrorInfo, ErrorNotice, StatusBadge } from "./common";
import {
  EnumSelect,
  errorAt,
  Field,
  FreeTagInput,
  HabitatTagsInput,
  Section,
  SkillsEditor,
  SpawnModifiersEditor,
  StringListEditor,
  type EnumOption,
} from "./fields";

// ---------------------------------------------------------------- vocabularies

const ACTIVITY_HINTS: Record<ActivityPattern, string> = {
  diurnal: "Active by day",
  nocturnal: "Active at night",
  crepuscular: "Active at dawn and dusk",
  cathemeral: "Irregular bouts, day and night",
  sheltering_by_day: "Hides by day, emerges later",
  seasonal: "Appears in certain seasons",
  TBD: "Not decided yet",
};
const ACTIVITY_OPTIONS: EnumOption<ActivityPattern>[] = ACTIVITY_PATTERNS.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
  description: ACTIVITY_HINTS[v],
}));

const RARITY_HINTS: Record<Rarity, string> = {
  common: "Seen on most surveys",
  uncommon: "Needs the right place or time",
  rare: "A notable find",
  TBD: "Not decided yet",
};
const RARITY_OPTIONS: EnumOption<Rarity>[] = RARITIES.map((v) => ({ value: v, description: RARITY_HINTS[v] }));

const MOVEMENT_HINTS: Record<MovementStyle, string> = {
  still: "Barely moves",
  skulker: "Short cautious moves with long pauses",
  forager: "Slow meandering",
  roamer: "Steady travel",
  darter: "Quick bursts with frequent stops",
};
const MOVEMENT_OPTIONS: EnumOption<MovementStyle>[] = MOVEMENT_STYLES.map((v) => ({
  value: v,
  description: MOVEMENT_HINTS[v],
}));

const SECTIONS = [
  { id: "identity", title: "Identity" },
  { id: "habitat", title: "Habitat" },
  { id: "diet", title: "Diet & temperament" },
  { id: "activity", title: "Activity & rarity" },
  { id: "appearance", title: "Appearance" },
  { id: "behaviour", title: "Behaviour" },
  { id: "ecology", title: "Ecology & field" },
  { id: "game", title: "Game" },
] as const;

const REQUIRED = new Set<string>(PUBLISH_REQUIRED_FIELDS);
const IN_GAME = new Set<string>(GAME_FIELDS);

// ---------------------------------------------------------------- page

export function WildkinEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const stats = useStats();
  const entry = useWildkinEntry(id);

  if (isNew) {
    if (stats.isPending) return <PageLoading />;
    return <WildkinForm key="new" entry={null} initial={emptyEntry(stats.data?.nextRegistryNumber ?? 1)} />;
  }
  if (entry.isPending) return <PageLoading />;
  if (entry.error || !entry.data) {
    return (
      <div className="space-y-4 px-8 py-8">
        <ErrorNotice error={entry.error} title={`Could not load “${id}”`} />
        <Button asChild variant="outline">
          <Link to="/wildkin">
            <ArrowLeftIcon /> Back to Wildkin
          </Link>
        </Button>
      </div>
    );
  }
  return <WildkinForm key={entry.data.id} entry={entry.data} initial={entryToFormValues(entry.data)} />;
}

function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center text-muted">
      <Loader2Icon className="mr-2 size-4 animate-spin" /> Loading…
    </div>
  );
}

// ---------------------------------------------------------------- form

const resolver = zodResolver(WildkinEntryInputSchema) as unknown as Resolver<WildkinEntryData>;

function WildkinForm({ entry, initial }: { entry: WildkinEntry | null; initial: WildkinEntryData }) {
  const isNew = entry === null;
  const navigate = useNavigate();
  const form = useForm<WildkinEntryData>({ resolver, defaultValues: initial, mode: "onTouched" });
  const { control, register, formState, getValues, setValue, reset, handleSubmit } = form;
  const errors = formState.errors;
  const dirty = formState.isDirty;

  const create = useCreateWildkin();
  const update = useUpdateWildkin();
  const publish = usePublishWildkin();
  const restore = useRestoreWildkin();
  const busy = create.isPending || update.isPending || publish.isPending || restore.isPending;

  const location = useLocation();
  // A publish that failed right after creating the entry arrives here via router state.
  const [serverError, setServerError] = useState<unknown>(
    () => (location.state as { serverError?: unknown } | null)?.serverError ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const allowNav = useRef(false);

  // ---- id: derived from the name on new entries until the author edits it
  const [idTouched, setIdTouched] = useState(!isNew);
  const name = useWatch({ control, name: "name" });
  useEffect(() => {
    if (isNew && !idTouched) setValue("id", slugify(name ?? ""), { shouldDirty: true });
  }, [isNew, idTouched, name, setValue]);

  // ---- unsaved-changes guard
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNav.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const goTo = useCallback(
    (path: string, state?: unknown) => {
      allowNav.current = true;
      navigate(path, { replace: isNew, state });
    },
    [navigate, isNew],
  );

  // ---- save / publish
  const persist = async (values: WildkinEntryData): Promise<WildkinEntry> => {
    const saved = isNew ? await create.mutateAsync(values) : await update.mutateAsync({ id: entry.id, body: values });
    reset(entryToFormValues(saved));
    return saved;
  };

  const onSaveDraft = handleSubmit(async (values) => {
    setServerError(null);
    setNotice(null);
    try {
      const saved = await persist(values);
      if (isNew) goTo(`/wildkin/${saved.id}`);
      else setNotice("Draft saved.");
    } catch (e) {
      setServerError(e);
    }
  });

  const onPublish = handleSubmit(async (values) => {
    setServerError(null);
    setNotice(null);
    try {
      const saved = isNew || dirty ? await persist(values) : entry;
      let publishError: unknown = null;
      try {
        await publish.mutateAsync(saved.id);
      } catch (e) {
        publishError = e;
      }
      if (isNew) goTo(`/wildkin/${saved.id}`, publishError ? { serverError: asErrorInfo(publishError) } : undefined);
      else if (publishError) setServerError(publishError);
      else setNotice("Published. The game now uses this version.");
    } catch (e) {
      setServerError(e);
    }
  });

  /** For the art panel: save the draft (if needed) and report whether it worked. */
  const ensureSaved = () =>
    new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (values) => {
          setServerError(null);
          try {
            await persist(values);
            resolve(true);
          } catch (e) {
            setServerError(e);
            resolve(false);
          }
        },
        () => resolve(false),
      )();
    });

  // ---- AI suggestion → form
  const applySuggestion = (res: AssistResponse): string[] => {
    const acceptId = isNew && (!idTouched || !getValues("id"));
    const updates = suggestionUpdates(res.suggestion, { acceptId });
    for (const [key, value] of updates) {
      setValue(key as Path<WildkinEntryData>, value as never, {
        shouldDirty: true,
        shouldValidate: formState.isSubmitted,
      });
    }
    if (updates.some(([k]) => k === "id")) setIdTouched(true);
    return updates.map(([k]) => k);
  };

  const status = entry ? <StatusBadge entry={entry} /> : <span className="text-xs text-faint">Not saved yet</span>;
  const errorCount = Object.keys(errors).length;
  const deleted = !!entry?.deletedAt;
  const registryNumber = useWatch({ control, name: "registryNumber" });

  return (
    <FormProvider {...form}>
      <div className="flex min-h-full flex-col">
        <PageHeader
          kicker={`${Number.isFinite(registryNumber) ? formatRegistryNumber(registryNumber) : "No. ???"} · ${isNew ? "New entry" : entry.id}`}
          title={name?.trim() || (isNew ? "New Wildkin" : entry.name)}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/wildkin">
                <ArrowLeftIcon /> All Wildkin
              </Link>
            </Button>
          }
        >
          <div className="mt-2 flex items-center gap-2">
            {status}
            {dirty ? (
              <span className="flex items-center gap-1 text-xs text-warning">
                <CircleDotIcon className="size-3" /> Unsaved changes
              </span>
            ) : null}
          </div>
        </PageHeader>

        <form
          id="wildkin-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSaveDraft();
          }}
          className="grid flex-1 grid-cols-1 gap-6 px-8 py-6 xl:grid-cols-[minmax(0,1fr)_360px]"
        >
          <div className="min-w-0 space-y-6">
            {deleted ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
                <span>This Wildkin is deleted. Restore it to edit, publish or generate art.</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive-ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    <Trash2Icon /> Delete permanently
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      restore.mutate(entry.id, {
                        onSuccess: (e) => {
                          reset(entryToFormValues(e));
                          if (e.registryNumber !== entry.registryNumber) {
                            setNotice(
                              `Restored as ${formatRegistryNumber(e.registryNumber)}: ${formatRegistryNumber(entry.registryNumber)} is now used by another Wildkin.`,
                            );
                          }
                        },
                        onError: setServerError,
                      })
                    }
                  >
                    <RotateCcwIcon /> Restore
                  </Button>
                </div>
              </div>
            ) : null}

            <AssistPanel getValues={getValues} onApply={applySuggestion} />

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
              <span>
                <span className="text-gold">*</span> required to publish. Everything else may stay empty or TBD in a draft.
              </span>
              <span className="flex items-center gap-1.5">
                <InGameChip /> copied to the game when you publish (see the in-game preview). Unmarked fields are
                encyclopedia only.
              </span>
            </div>

            <Section id="identity" number={1} title="Identity">
              <Field
                label={<FieldLabel name="id" label="Canonical ID" />}
                error={errors.id?.message}
                hint={isNew ? "Derived from the name until you edit it. Cannot change after creation." : "Immutable after creation."}
              >
                {(id) => (
                  <Input
                    id={id}
                    className="font-mono"
                    disabled={!isNew}
                    aria-invalid={!!errors.id || undefined}
                    {...register("id", { onChange: () => setIdTouched(true) })}
                  />
                )}
              </Field>
              <Field
                label={<FieldLabel name="registryNumber" label="Registry number" />}
                error={errors.registryNumber?.message}
                hint="Shown as “No. 001” in the Registry."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={9999}
                    className="font-mono"
                    aria-invalid={!!errors.registryNumber || undefined}
                    {...register("registryNumber", { valueAsNumber: true })}
                  />
                )}
              </Field>
              <TextField name="name" label="Name" />
              <TextField name="classification" label="Classification" placeholder="e.g. Canopy Bird Wildkin" />
              <TextField name="identity" label="Identity" multiline wide hint="One-line identity for the encyclopedia." />
              <TextField
                name="registryDescription"
                label="Registry description"
                multiline
                wide
                hint="What players read in the in-game Registry after observing this Wildkin. The AI assistant writes one to match your idea."
              />
              <TextField
                name="canonStatus"
                label="Canon status"
                multiline
                wide
                hint="What is ESTABLISHED vs PROPOSED / TBD."
              />
              <TextField name="inspiration" label="Inspiration" multiline wide />
            </Section>

            <Section id="habitat" number={2} title="Habitat">
              <Controller
                control={control}
                name="habitatTags"
                render={({ field }) => (
                  <Field
                    label={<FieldLabel name="habitatTags" label="Habitat tags" />}
                    className="md:col-span-2"
                    error={errorAt(errors, "habitatTags")}
                    hint="Used by the game to match habitats (habitatAffinity)."
                  >
                    {(id) => <HabitatTagsInput id={id} value={field.value} onChange={field.onChange} />}
                  </Field>
                )}
              />
              <TextField name="habitatSummary" label="Habitat summary" wide hint="Short line for the in-game Registry." />
              <TextField name="habitat" label="Habitat & distribution" multiline wide />
            </Section>

            <Section id="diet" number={3} title="Diet & temperament">
              <TextField name="diet" label="Diet" multiline />
              <TextField name="temperament" label="Temperament" multiline />
              <TagsField name="dietTags" label="Diet tags" placeholder="e.g. nectar, seeds…" />
              <TagsField name="temperamentTags" label="Temperament tags" placeholder="e.g. shy, curious…" />
            </Section>

            <Section id="activity" number={4} title="Activity & rarity">
              <Controller
                control={control}
                name="activityPattern"
                render={({ field }) => (
                  <Field label={<FieldLabel name="activityPattern" label="Activity pattern" />}>
                    {(id) => (
                      <EnumSelect id={id} value={field.value} onChange={field.onChange} options={ACTIVITY_OPTIONS} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="rarity"
                render={({ field }) => (
                  <Field label={<FieldLabel name="rarity" label="Rarity" />} hint="Rarity is not strength.">
                    {(id) => <EnumSelect id={id} value={field.value} onChange={field.onChange} options={RARITY_OPTIONS} />}
                  </Field>
                )}
              />
              <TextField name="activityNotes" label="Activity notes" multiline />
              <TextField name="rarityNotes" label="Rarity notes" multiline />
            </Section>

            <Section id="appearance" number={5} title="Appearance" description="Feeds the PixelLab art prompt">
              <TextField name="visualHook" label="Visual hook" wide hint="The one thing players remember at a glance." />
              <TextField name="physicalDescription" label="Physical description" multiline wide />
              <TextField name="visualDesignNotes" label="Visual design notes" multiline wide />
            </Section>

            <Section id="behaviour" number={6} title="Behaviour">
              <Controller
                control={control}
                name="movementStyle"
                render={({ field }) => (
                  <Field label={<FieldLabel name="movementStyle" label="Movement style" />} hint="How spawns wander on the radar.">
                    {(id) => (
                      <EnumSelect id={id} value={field.value} onChange={field.onChange} options={MOVEMENT_OPTIONS} />
                    )}
                  </Field>
                )}
              />
              <div className="hidden md:block" />
              <TextField name="behavior" label="Behaviour" multiline wide />
            </Section>

            <Section id="ecology" number={7} title="Ecology & field">
              <TextField name="role" label="Role" multiline wide hint="Gameplay / narrative role." />
              <TextField name="ecology" label="Ecology" multiline wide />
              <TextField name="fieldSigns" label="Field signs" multiline wide hint="Tracks, sounds, traces a researcher would notice." />
            </Section>

            <Section id="game" number={8} title="Game">
              <TextField name="gameplayProfile" label="Gameplay profile" multiline />
              <TextField name="assetNeeds" label="Asset needs" multiline />
              <Controller
                control={control}
                name="spawnModifiers"
                render={({ field }) => (
                  <Field
                    label={<FieldLabel name="spawnModifiers" label="Spawn modifiers" />}
                    className="md:col-span-2"
                    error={errorAt(errors, "spawnModifiers")}
                  >
                    {() => <SpawnModifiersEditor value={field.value} onChange={field.onChange} />}
                  </Field>
                )}
              />
              <Field label={<FieldLabel name="skills" label="Skills" />} className="md:col-span-2" error={errorAt(errors, "skills")}>
                {() => <SkillsEditor control={control} errors={errors} />}
              </Field>
              <Controller
                control={control}
                name="openQuestions"
                render={({ field }) => (
                  <Field label="Open questions" className="md:col-span-2" error={errorAt(errors, "openQuestions")}>
                    {() => (
                      <StringListEditor
                        value={field.value}
                        onChange={field.onChange}
                        max={24}
                        addLabel="Add question"
                        placeholder="Something the Bible has not decided yet…"
                      />
                    )}
                  </Field>
                )}
              />
            </Section>
          </div>

          <aside className="space-y-6">
            <ArtPanel entry={entry} dirty={dirty} ensureSaved={ensureSaved} />
            <GamePreview
              control={control}
              id={entry?.id ?? null}
              art={entry?.art ?? null}
              publishedAt={entry?.publishedAt ?? null}
              edited={!!entry?.hasUnpublishedChanges || dirty}
            />
            <nav className="rounded-lg border border-line bg-panel p-4 xl:sticky xl:top-6">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Contents</p>
              <ol className="space-y-0.5 text-sm">
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="flex gap-2 rounded px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg">
                      <span className="w-5 font-mono text-xs text-gold">§{i + 1}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            {entry ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-panel p-4 text-xs">
                <dt className="text-faint">Created</dt>
                <dd className="text-muted">{fmtDate(entry.createdAt)}</dd>
                <dt className="text-faint">Updated</dt>
                <dd className="text-muted">{fmtDate(entry.updatedAt)}</dd>
                <dt className="text-faint">Published</dt>
                <dd className="text-muted">{entry.publishedAt ? fmtDate(entry.publishedAt) : "never"}</dd>
              </dl>
            ) : null}
          </aside>
        </form>

        {/* sticky action bar */}
        <footer className="sticky bottom-0 z-10 border-t border-line bg-panel/95 px-8 py-3 backdrop-blur">
          {serverError ? (
            <div className="mb-3 max-h-48 overflow-y-auto">
              <ErrorNotice
                error={serverError}
                title={asErrorInfo(serverError).code === "publish_incomplete" ? "Cannot publish yet" : "Something went wrong"}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {status}
            {errorCount ? (
              <span className="text-xs text-danger">
                Fix {errorCount} field{errorCount === 1 ? "" : "s"}: {Object.keys(errors).map(fieldLabel).join(", ")}
              </span>
            ) : notice ? (
              <span className="text-xs text-accent">{notice}</span>
            ) : dirty ? (
              <span className="text-xs text-warning">Unsaved changes</span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {!isNew && !deleted ? (
                <Button variant="destructive-ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon /> Delete
                </Button>
              ) : null}
              <Button type="submit" form="wildkin-form" variant="secondary" disabled={busy || deleted}>
                {create.isPending || update.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                Save draft
              </Button>
              <Button disabled={busy || deleted} onClick={() => void onPublish()}>
                {publish.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                {isNew || dirty ? "Save & publish" : "Publish"}
              </Button>
            </div>
          </div>
        </footer>
      </div>

      <DeleteWildkinDialog
        wildkin={confirmDelete && entry ? entry : null}
        onOpenChange={setConfirmDelete}
        onDeleted={() => goTo("/wildkin")}
      />

      <AlertDialog open={blocker.state === "blocked"} onOpenChange={(o) => !o && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes to this Wildkin. They will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

// ---------------------------------------------------------------- field shorthands

type TextKey = {
  [K in keyof WildkinEntryData]: WildkinEntryData[K] extends string ? K : never;
}[keyof WildkinEntryData];
type TagKey = "dietTags" | "temperamentTags";

/** Small marker for fields that publishing copies into the game. */
function InGameChip() {
  return (
    <span
      title="Copied to the game when you publish"
      className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1 py-px text-[10px] font-medium tracking-wide text-accent uppercase"
    >
      <GamepadIcon className="size-3" /> In game
    </span>
  );
}

/** Field label with the "required to publish" star and the "In game" marker. */
function FieldLabel({ name, label }: { name: string; label: string }): ReactNode {
  return (
    <>
      {label}
      {REQUIRED.has(name) ? <span className="text-gold">*</span> : null}
      {IN_GAME.has(name) ? <InGameChip /> : null}
    </>
  );
}

/** A string field: Input for short lines, auto-growing Textarea for prose. */
function TextField({
  name,
  label,
  hint,
  multiline,
  wide,
  placeholder,
}: {
  name: Exclude<TextKey, "id">;
  label: string;
  hint?: string;
  multiline?: boolean;
  wide?: boolean;
  placeholder?: string;
}) {
  const { register, formState } = useFormContext<WildkinEntryData>();
  const error = formState.errors[name]?.message;
  return (
    <Field label={<FieldLabel name={name} label={label} />} hint={hint} error={error} className={cn(wide && "md:col-span-2")}>
      {(id) =>
        multiline ? (
          <Textarea id={id} placeholder={placeholder} aria-invalid={!!error || undefined} {...register(name)} />
        ) : (
          <Input id={id} placeholder={placeholder} aria-invalid={!!error || undefined} {...register(name)} />
        )
      }
    </Field>
  );
}

function TagsField({ name, label, placeholder }: { name: TagKey; label: string; placeholder?: string }) {
  const { control, formState } = useFormContext<WildkinEntryData>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field label={label} error={errorAt(formState.errors, name)}>
          {(id) => <FreeTagInput id={id} value={field.value} onChange={field.onChange} placeholder={placeholder} />}
        </Field>
      )}
    />
  );
}
