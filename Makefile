.DEFAULT_GOAL := help

.PHONY: help demo screenshots screenshots-landing screenshots-audit visual-check visual-baseline

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-22s %s\n", $$1, $$2}'

# The signed-in session goes to .demo/ (gitignored, deleted when the demo stops): visual/host-hooks.sh hands it to
# the capture. DEMO_NOW (set by visual/scenes.json for the captures) fixes the server's and the upstream's clock.
demo: export DEMO_STORAGE_STATE ?= .demo/storage-state.json
demo: ## Boot an isolated demo instance (fake upstreams, throwaway admin) and leave it running; Ctrl-C deletes it
	node scripts/demo/instance.mjs

# Visual pipeline (s3ntin3l8/visual-kit): README and landing screenshots, audit evidence and the per-change
# visual check, all rendered in one pinned image against `make demo`. The image is pinned in visual/Dockerfile
# (Dependabot bumps it); visual/.kit/run.sh is extracted from it. Spec: visual-kit's CONTRACT.md.
VISUAL_IMAGE := visual-kit-local/aerie
VISUAL_RUN := VISUAL_KIT_IMAGE=$(VISUAL_IMAGE) visual/.kit/run.sh
# The four docs/screenshots images the web app manifest lists (app/manifest.ts); the app can only serve them from public/.
MANIFEST_SHOTS := home-dark-desktop status-dark-desktop home-dark-mobile streams-dark-mobile

visual/.kit/run.sh: visual/Dockerfile
	docker build -q -t $(VISUAL_IMAGE) - < visual/Dockerfile
	mkdir -p visual/.kit && docker run --rm $(VISUAL_IMAGE) host-files | tar -x -C visual/.kit

screenshots: visual/.kit/run.sh ## README screenshots into docs/screenshots (committed) and the web app manifest copies. FORCE=1 replaces a folder visual-kit did not write
	$(VISUAL_RUN) readme $(if $(FORCE),--force)
	@# The README shows stills only; the loop is for the landing page (screenshots-landing). Loops re-encode
	@# differently on every run, so keeping them here would make the weekly refresh PR itself noise.
	rm -f docs/screenshots/*.webm docs/screenshots/*.mp4 docs/screenshots/*.jpg
	mkdir -p public/pwa/screenshots
	for s in $(MANIFEST_SHOTS); do cp docs/screenshots/$$s.png public/pwa/screenshots/$$s.png; done

screenshots-landing: visual/.kit/run.sh ## Landing-page stills and loop into OUT (default ./landing-shots) for personal-landing
	$(VISUAL_RUN) landing --out "$(or $(OUT),landing-shots)" $(if $(FORCE),--force)

screenshots-audit: visual/.kit/run.sh ## Audit evidence for AUDIT=YYYY-MM-<scope>-<topic> into docs/audit/assets/ (local only)
	@test -n "$(AUDIT)" || { echo "AUDIT=YYYY-MM-<scope>-<topic> is required"; exit 1; }
	$(VISUAL_RUN) audit --slug "$(AUDIT)" $(if $(FORCE),--force)

# Only a whole number from 1 to 99 is forwarded. REPEAT_OK is a pinned mirror of the range visual-kit's launcher
# accepts (host/run.sh, 0.4.0): if the launcher's range moves, move this list with it. An ambient REPEAT=yes, 0 or
# 100 in the environment is ignored with a warning, as the launcher does.
REPEAT_OK := 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99
REPEAT_N := $(and $(REPEAT),$(if $(word 2,$(strip $(REPEAT))),,$(filter $(REPEAT_OK),$(strip $(REPEAT)))))
# An invalid REPEAT given on the command line is an error, before the image build: a typo must not look like a determinism check that ran once.
ifneq ($(filter visual-check,$(MAKECMDGOALS)),)
ifneq ($(strip $(REPEAT)),)
ifeq ($(REPEAT_N),)
ifeq ($(origin REPEAT),command line)
$(error REPEAT must be a whole number from 1 to 99, got "$(REPEAT)")
else
$(warning REPEAT="$(REPEAT)" from the environment is ignored: not a whole number from 1 to 99, so no determinism check runs)
endif
endif
endif
endif

visual-check: visual/.kit/run.sh ## Before/after of the routes a UI change touches (ROUTES=/streams,status) against BASE (default: merge base); REPEAT=N also recaptures the head N-1 times and fails if it is not deterministic
	$(VISUAL_RUN) check $(if $(ROUTES),--routes "$(ROUTES)") $(if $(BASE),--base "$(BASE)") $(if $(FORCE),--force) $(if $(REPEAT_N),--repeat "$(REPEAT_N)")

visual-baseline: visual/.kit/run.sh ## Regenerate the committed baselines (visual/baselines): the scenes flagged "baseline": true
	$(VISUAL_RUN) baseline $(if $(FORCE),--force)
