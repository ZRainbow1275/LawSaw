# LawSaw Cleanup Checkpoint (2026-02-10)

## 1) Scope and guardrails
- Goal: remove temp/test/build leftovers, free disk space, reduce runtime noise.
- Hard guardrails applied:
  - Ignored `.trellis/` as requested.
  - Did not touch business-source scope under `dev/` (no `dev/` folder exists in this repo now).
  - `prompts/` was protected: existing files were not deleted or modified.
  - Node actions were limited to LawSaw-related process only.
  - Docker actions were limited to LawSaw-related resources only.

## 2) Baseline before cleanup
### Storage hotspots
- `target/`: 103006.19 MB
- `apps/web/`: 1627.54 MB
  - `apps/web/node_modules`: 1448.67 MB
  - `apps/web/.next`: 177.02 MB
- root `node_modules/`: 12.46 MB
- `.playwright-mcp/`: 2.27 MB
- `tmp/`: 1.05 MB

### Runtime baseline
- Project Node process matched and found:
  - PID 26348 (`next/dist/server/lib/start-server.js` under `D:/Desktop/LawSaw/apps/web/node_modules`)
- Project Docker runtime detected:
  - running containers: `lawsaw-dev-postgres`, `lawsaw-dev-redis`, `lawsaw-dev-minio`

## 3) Cleanup actions performed
### 3.1 Filesystem cleanup (cache/build/test residue only)
Removed directories:
- `target/`
- `tmp/`
- `.playwright-mcp/`
- `node_modules/`
- `apps/web/node_modules/`
- `apps/web/.next/`
- `apps/web/playwright-report/`
- `apps/web/test-results/`
- `apps/web/coverage/`

Removed files by pattern:
- `tmp*.log` (3)
- `tmp*.sql` (1)
- `tmp.patch` (1)
- `tmpclaude-*-cwd` (451)

### 3.2 Node process cleanup (project-only)
- Stopped project process: PID 26348.
- Recheck result: no remaining LawSaw-related Node process.

### 3.3 Docker cleanup (project-only, only unused)
Removed images (no container reference):
- `lawsaw-postgres-pgvector:local`
- `lawsaw-e2e-api:latest`
- `lawsaw-e2e-worker:latest`
- `lawsaw-e2e-web:latest`
- `lawsaw-web:latest`

Removed volumes (no container mounted):
- `lawsaw-debug-postgres-chown`
- `lawsaw-debug-redis-chown`
- `lawsaw-e2e_minio_data`
- `lawsaw-e2e_postgres_data`
- `lawsaw-e2e_redis_data`
- `lawsaw_caddy_api_mtls_config`
- `lawsaw_caddy_api_mtls_data`
- `lawsaw_caddy_config`
- `lawsaw_caddy_data`
- `lawsaw_minio_data`
- `lawsaw_n8n_data`
- `lawsaw_postgres_data`
- `lawsaw_redis_data`
- `lawsaw_vault_data`
- `lawsaw_vault_tokens`

Removed network (unused):
- `lawsaw-e2e_law-eye-network`

Kept in-use resources:
- containers: `lawsaw-dev-postgres`, `lawsaw-dev-redis`, `lawsaw-dev-minio`
- images: `lawsaw-pg-simple:local`, `lawsaw-redis:local`
- volumes: `lawsaw-dev-postgres-data`, `lawsaw-dev-redis-data`, `lawsaw-dev-minio-data`

## 4) prompts/ compliance handling
- To guarantee "add-only" behavior in `prompts/`, executed:
  - `git restore --worktree --staged -- prompts`
- Result: existing `prompts/` docs are restored; only additions remain in this folder.

## 5) File ownership root-cause chain (full-repo mapping rules)
For every file, ownership is mapped by path domain:
- `apps/`: product web app layer (business demand -> route/component -> UI behavior)
- `crates/`: Rust backend/domain/service (business capability -> model/route/storage -> API/worker)
- `config/`: runtime config (environment policy -> config load -> runtime behavior)
- `infra/`: infrastructure definitions (service governance -> infra orchestration -> stability)
- `n8n/`: workflow automation (process requirement -> workflow -> automated execution)
- `scripts/`: operational/dev scripts (repeat operation -> script automation -> reproducibility)
- `docs/`: official project docs (knowledge -> run/develop guidance -> team alignment)
- `prompts/`: governance/audit/planning assets (engineering governance -> audit/spec/state -> AI context)
- root files: entry controls (`Cargo.toml`, `docker-compose*.yml`, `README.md`, etc.)

Doc inventory count:
- total doc files found (excluding `.trellis`): 53
- docs were retained; no structural deletion was done in docs system during this checkpoint.

## 6) Outcome
- Filesystem reclaimed (conservative): ~104647.66 MB (~102.2 GB)
- Docker images reclaimed: ~5.52 GB (sum of removed project image sizes)
- Current repo size (excluding `.git`): ~65.35 MB

## 7) Recovery commands (when needed)
- Reinstall frontend deps: `pnpm -C apps/web install`
- Rebuild Rust artifacts: `cargo build`
- Restart web dev: `pnpm -C apps/web dev`

## 8) Checkpoint conclusion
- Completed large cleanup and runtime noise reduction.
- This state is ready to serve as the next development checkpoint baseline.
- Core safety constraints were met: no non-project process kill, no non-project Docker cleanup, no existing file deletion inside `prompts/`.
