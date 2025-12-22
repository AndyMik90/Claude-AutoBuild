---
description: Sync the fork with the upstream repository (AndyMik90/Auto-Claude)
---

This workflow automates the process of fetching the latest changes from the upstream repository and attempting to merge them into an integration branch for testing.

1. Fetch the latest upstream changes

   ```bash
   git fetch upstream
   ```

2. Update the local upstream mirror branch
   // turbo

   ```bash
   git checkout upstream
   git reset --hard upstream/main
   ```

3. Prepare the integration branch (reset to match main)
   // turbo

   ```bash
   git checkout integration
   git reset --hard main
   ```

4. Attempt to merge upstream changes

   ```bash
   git merge upstream/main --no-ff
   ```

5. **STOP AND VERIFY**

   - If there are conflicts, the agent must resolve them now.
   - Run tests to ensure the merge didn't break anything:
     - `/run_backend_tests`

6. PROMPT USER: "Merge to integration successful/resolved. Ready to merge into main?"

7. Merge into main

   ```bash
   git checkout main
   git merge upstream/main --no-ff -m "Sync upstream"
   ```

8. Cleanup
   ```bash
   git checkout integration
   git reset --hard main
   ```
