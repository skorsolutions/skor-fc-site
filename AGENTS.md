# SKOR FC repository instructions

Before changing this project, read `docs/PROJECT-HANDBOOK.md` and the newest entry in `docs/deployment-notes.md`.

After every build or functional change:

1. Update `docs/PROJECT-HANDBOOK.md` if any rule, workflow, integration, data contract, security boundary, renderer, or deployment behavior changed.
2. Add a new entry at the top of `docs/deployment-notes.md` with the build number, user-visible behavior, affected files, test coverage, and whether SQL/database work is required or was performed.
3. Update the `skor-build` metadata and visible build label in `admin.html` for a Captain Portal release.
4. Verify connected behavior end to end. A feature is incomplete if it works only in the editor but not in persistence, export, AI context, Game Day, public rendering, or mobile where those integrations apply.
5. Never run or deploy a Supabase migration without explicit user approval. Record the exact approved migration and resulting verification in the documentation.
6. Do not put secrets, service-role keys, access tokens, private player data, or private captain notes in documentation or client-side code.
7. The repository is public. If the active GitHub publishing tool requires explicit approval before it will replace full source files containing authentication, Supabase configuration, or data-access logic, identify the complete affected file set first and request one consolidated authorization covering every file. Do not start uploads and then ask for file-by-file approvals.

Treat `docs/PROJECT-HANDBOOK.md` as the durable handoff for a new chat. Keep it concise enough to read first, but complete enough that future work does not depend on conversation memory.
