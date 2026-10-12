<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

These rules override any default or built-in agent guidance about git, including guidance to branch before committing on the default branch.

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.
- Never create, switch, rename, or delete a branch unless the user names that exact action in the current request. A request to commit is not a request to branch.
- All work happens on `main`. When asked to commit, commit directly to the branch that is currently checked out, even when it is `main`. Never move work to a feature branch "to be safe".
- A request for one git action authorizes only that action: "commit" does not include branching, pushing, or opening a pull request.
- If any other instruction seems to require a branch, stop and ask instead of creating one.

## Database

- Apply database schema changes with `npm run db:push` (`drizzle-kit push`) only. Never use migrations (`drizzle-kit generate` / `drizzle-kit migrate`) and never create files under `drizzle/`.
- This is a development project: no backwards compatibility, data is worthless. Prefer data loss — never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean slate.

## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

## Forms

- Define validation schemas with plain `zod` (`z.object()` mirroring the table
  columns, exported from `db/schema.ts` alongside an inferred input type). Do
  NOT use `drizzle-zod`'s `createInsertSchema` in this repo: it builds the
  object through its own zod instance, and with multiple zod copies in the
  dependency graph (top-level v3 plus nested v4 under `@neon/*`) the instances
  get mixed inside the Next 16 bundle. Zod v4's shape check is lazy, so the
  schema imports fine and even parses under plain Node, then throws
  `Invalid element at key "<field>": expected a Zod schema` at runtime on the
  first form validation or submit. A single `zod` import keeps one instance
  and avoids the whole class of bug.
- Build forms with `react-hook-form` + `zodResolver(schema)` and shadcn `Field`
  composition: `FieldGroup` wrapping `Controller` → `Field data-invalid` →
  `FieldLabel` + control with `aria-invalid` → `FieldError
  errors={[fieldState.error]}`. Reference:
  https://ui.shadcn.com/docs/forms/react-hook-form
- This project uses Base UI primitives, not Radix: custom dialog triggers and
  close buttons use `render={<Button ... />}` (never `asChild`); `ToggleGroup`
  is array-valued (`value={[v]}`, `onValueChange={(vals) => ...vals[0]}`); use
  it for option sets of 2–7 choices such as template presets. Toasts go through
  the `toast` manager from `@/components/ui/toast` (`toast.add({ title,
  description, type })`); `<Toaster />` is already mounted in `app/layout.tsx`.
- Server actions live in `actions/*.ts` with `"use server"`: check `await
  auth()` from `@clerk/nextjs/server` first (throw when unauthenticated),
  validate the input with the shared schema's `.parse()`, then write via `db`.
- Verify with `npm run typecheck`, `npx eslint <files>`, and `npm run build`.
  The build step matters: bundler-only bugs like the mixed-zod-instance crash
  above never reproduce under plain Node, so typecheck alone is not enough.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
