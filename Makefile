.DEFAULT_GOAL := help

.PHONY: help demo screenshots screenshots-landing

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-22s %s\n", $$1, $$2}'

demo: ## Boot an isolated demo instance (fake upstreams, throwaway admin) and leave it running; Ctrl-C deletes it
	node scripts/demo/instance.mjs

screenshots: ## Regenerate docs/screenshots (dark + light) from an isolated demo instance
	node scripts/demo/capture.mjs

screenshots-landing: ## Landing-page stills + loop into OUT (default ./landing-shots); loop needs ffmpeg
	node scripts/demo/capture.mjs --profile landing --out "$(or $(OUT),landing-shots)"
