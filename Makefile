all dev:
	yarn run dev

build: build-debug build-production

build-debug:
	yarn run build-debug

build-production:
	yarn run build-production

lint:
	yarn run lint

prettier:
	yarn run prettier

clean:
	rm -Rf build node_modules

.PHONY: all dev build build-debug build-production lint prettier clean
