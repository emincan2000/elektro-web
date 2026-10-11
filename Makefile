# elektro web — build and test
#   make bundle   rebuild web/elektro-bundle.zip from the installed elektro
#   make test     everything below (needs node, firefox-esr for e2e)
#   make serve    http://127.0.0.1:8765/?pyodide=/pyodide/  (local Pyodide, no CDN)

NODE_WS = node --experimental-websocket

.PHONY: bundle test test-lib test-pyodide test-native test-e2e serve deps

deps:
	cd tests && npm install --no-audit --no-fund

bundle:
	python3 tools/build_bundle.py

test: test-lib test-pyodide test-native test-e2e

test-lib:
	node --test tests/test_lib.mjs

test-pyodide:            # every help example of every command, inside Pyodide
	cd tests && node run_examples.mjs

test-native: test-pyodide   # same examples with the installed CLI: results must match
	cd tests && python3 compare_native.py

test-e2e:                # real headless Firefox
	cd tests && $(NODE_WS) e2e.mjs

serve:
	cd tests && node serve.mjs 8765
