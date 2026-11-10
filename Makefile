# ==================================================================================== #
# PRODUCTION
# ==================================================================================== #

## deploy: apply remote D1 migrations and deploy the Worker
.PHONY: deploy
deploy:
	@echo 'Applying remote D1 migrations...'
	npx wrangler d1 migrations apply MY_DB --remote
	@echo 'Deploying Worker...'
	npm run deploy
