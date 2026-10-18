import type { CapturedWildkinView } from "@wildbound/shared";
import { Button } from "@/components/ui/button.tsx";

/**
 * Rename a captured Wildkin. A react-hook-form + TanStack Query exercise.
 *
 * ------------------------------------------------------------------------
 * TODO(you): turn this placeholder into a working form.
 *  1. Form state: useForm<RenameWildkinRequest>({
 *       resolver: zodResolver(RenameWildkinRequestSchema),
 *       defaultValues: { nickname: wildkin.nickname },
 *     })
 *     (copy the LoginPage pattern: features/auth/LoginPage.tsx)
 *  2. Mutation: useMutation({ mutationFn: (body) => api.renameWildkin(wildkin.id, body) })
 *     and on success `queryClient.invalidateQueries({ queryKey: keys.party })`, then onDone().
 *  3. An empty input should clear the nickname: map "" to null before submitting
 *     (zod: z.preprocess, or `setValueAs` in register()).
 *  4. Show field errors under the <Input>, a submitting state on the button,
 *     and errors.root for API errors (the endpoint answers 501 until you
 *     implement PATCH /api/game/wildkin/:id in apps/api/src/routes/game.ts).
 * ------------------------------------------------------------------------
 */
export function RenameForm({ wildkin, onDone }: { wildkin: CapturedWildkinView; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-deep-forest/60 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-[480px] rounded-t-xl border border-muted-paper bg-paper p-6 shadow-card sm:rounded-xl">
        <h2 className="text-headline-md text-ink">Rename {wildkin.nickname ?? wildkin.speciesName}</h2>
        <p className="mt-2 text-sm text-ink-muted">Not built yet. See the TODO in features/party/RenameForm.tsx.</p>
        <Button className="mt-5 w-full" variant="outline" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
