# Link Keeper: TypeScript in src/ is built into plugin/main.js, the file Obsidian loads.
# plugin/ then holds everything Obsidian needs: copy it to <vault>/.obsidian/plugins/link-keeper/.
# Needs Deno (https://deno.com). No Node or npm.

OUT := plugin
DIST := dist

.PHONY: build check test lint fmt zip clean

# Type-check, bundle src/main.ts into plugin/main.js, copy manifest.json next to it.
# "obsidian" stays an outside import: Obsidian provides it when the plugin loads.
build: check
	mkdir -p $(OUT)
	deno bundle --platform=browser --format=cjs --external=obsidian --output=$(OUT)/main.js src/main.ts
	cp manifest.json $(OUT)/manifest.json

check:
	deno check src/ tests/

# Builds first: the acceptance tests load plugin/main.js into a fake vault.
test: build
	deno test --allow-read=$(OUT)/main.js

lint:
	deno lint

fmt:
	deno fmt src/ tests/

# Zip for a GitHub release: unzipping it in <vault>/.obsidian/plugins/ gives link-keeper/.
zip: build
	rm -rf $(DIST)
	mkdir -p $(DIST)/link-keeper
	cp $(OUT)/main.js $(OUT)/manifest.json $(DIST)/link-keeper/
	cd $(DIST) && zip -rq link-keeper.zip link-keeper && rm -rf link-keeper

clean:
	rm -rf $(OUT) $(DIST)
