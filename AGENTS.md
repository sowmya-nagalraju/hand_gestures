<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Magic experience lives in `src/magic/` (ParticleField = Three.js physics+render, gestures.ts = MediaPipe gesture engine, MagicStage.tsx = UI/controller) — keeps vision, physics and UI separable.
- MagicStage is loaded via `React.lazy` inside `<ClientOnly>` on `/` — three.js and MediaPipe are browser-only and must not be evaluated during SSR.
- Particle count is fixed at 14000 with a spatial-hash separation pass (MIN_GAP) and a hard boundary box — user requirement: particles never touch and never leave the frame.
- `src/magic/{ParticleField,shapes,gestures}.ts` use @ts-nocheck — tight per-particle/landmark index loops conflict with noUncheckedIndexedAccess.
