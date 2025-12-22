---
description: Start a new feature branch following the fork's rebase workflow
---

1. Checkout main and ensure it's up to date
   // turbo

   ```bash
   git checkout main
   git pull origin main
   ```

2. Create the feature branch

   ```bash
   git checkout -b feature/${FEATURE_NAME}
   ```

   _(Agent: Replace ${FEATURE_NAME} with a descriptive name)_

3. Verify we are on the new branch
   ```bash
   git branch --show-current
   ```
