This workspace snapshot marks your MVP state.

Files created:
- .mvp_snapshot.json  — records the commit hash and a short note.
- restore_mvp.ps1     — safe PowerShell helper to create a branch at the recorded MVP commit.

How to restore the MVP state (PowerShell):
1. Save any work you want to keep (commit or stash).
2. Run: .\restore_mvp.ps1

Notes:
- The script will refuse to run if there are uncommitted changes, to avoid data loss.
- The script creates a branch named `mvp/restore-<short-sha>` at the recorded commit and checks it out.
- If you want to move `main` to the MVP commit (destructive), use:

   git checkout main
   git reset --hard <commit>

Replace <commit> with the commit from `.mvp_snapshot.json`.

If you later want me to restore to this MVP, say "restore to MVP" and I'll guide you through the exact steps.