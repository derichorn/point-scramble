# Point Scramble

Draw random workouts until you pass 100 points. Static site: no build step.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy (GitHub Pages)
1. Create a repo, push these files to `main`.
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. Push. The workflow publishes to `https://<user>.github.io/<repo>/`.

## Data
- Default: each visitor's custom activities are saved in their own browser (localStorage). No server, no accounts, nothing to abuse.
- Optional cloud sync (Supabase, per-user, Row Level Security):
  1. Create a Supabase project, run `supabase/schema.sql`.
  2. Enable Anonymous Sign-Ins (add CAPTCHA/rate limits).
  3. Repo Settings > Secrets and variables > Actions > **Variables**: add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
  4. Re-run the workflow. Never use the `service_role` key.
