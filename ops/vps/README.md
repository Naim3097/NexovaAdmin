# Auto-restart hook — pick up new agent tools without manual SSH

When a new agent tool is added (`app/src/lib/agent/tools.ts` + `scopes.ts`) and
deployed to Vercel, the live `/api/agent` manifest changes automatically. The
**MCP server** re-reads that manifest and needs no change. But **Hermes caches
its tool list at gateway startup**, so the VPS gateway must be restarted before
the agent can see the new tool.

This hook automates that restart. A systemd `--user` timer polls the manifest
every 5 minutes and restarts the `nexova` gateway **only when the set of tool
names changes** — so ordinary deploys cause no needless poller blips.

> Still manual after this: open a **new Telegram conversation** to see the new
> tools. Hermes bakes the tool list into each conversation when it starts; that
> layer is inherently per-chat and the hook can't refresh it.

## Files

| File | Installed to | Purpose |
|---|---|---|
| `nexova-tool-watch.sh` | `~/.hermes/profiles/nexova/nexova-tool-watch.sh` | the check + restart logic |
| `nexova-tool-watch.service` | `~/.config/systemd/user/` | oneshot that runs the script |
| `nexova-tool-watch.timer` | `~/.config/systemd/user/` | fires the service every 5 min |

It reads `NEXOVA_API_BASE` + `AGENT_API_KEY` from the gateway's own
`config.yaml`, so there's nothing extra to configure.

## Install (run on the VPS)

```bash
# 1. Place the script
cp ops/vps/nexova-tool-watch.sh ~/.hermes/profiles/nexova/nexova-tool-watch.sh
chmod +x ~/.hermes/profiles/nexova/nexova-tool-watch.sh

# 2. Place the systemd --user units
mkdir -p ~/.config/systemd/user
cp ops/vps/nexova-tool-watch.service ~/.config/systemd/user/
cp ops/vps/nexova-tool-watch.timer   ~/.config/systemd/user/

# 3. Enable the timer
systemctl --user daemon-reload
systemctl --user enable --now nexova-tool-watch.timer

# 4. Let user services run without an active login session
loginctl enable-linger "$USER"
```

(If the repo isn't checked out on the VPS, create the three files with the
heredocs in the deploy notes instead of `cp`.)

## Verify

```bash
systemctl --user list-timers nexova-tool-watch.timer   # next run scheduled?
systemctl --user start nexova-tool-watch.service        # run once now (records baseline)
cat ~/.hermes/profiles/nexova/logs/tool-watch.log       # what it did
```

## How it decides to restart

It hashes the sorted, de-duped set of tool **names** from the manifest and
compares to the last-seen hash in `~/.hermes/profiles/nexova/.tool-manifest.hash`.
Restart fires only when that hash changes (tool added / removed / renamed).
First run just records the baseline. Bad/empty manifest reads (deploy mid-flight,
auth error, network blip) are skipped, never restarted on.

## Uninstall

```bash
systemctl --user disable --now nexova-tool-watch.timer
rm ~/.config/systemd/user/nexova-tool-watch.{service,timer}
rm ~/.hermes/profiles/nexova/nexova-tool-watch.sh
systemctl --user daemon-reload
```
