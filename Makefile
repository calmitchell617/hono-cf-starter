# ==================================================================================== #
# PRODUCTION
# ==================================================================================== #

## deploy: apply remote D1 migrations and deploy the Worker
.PHONY: deploy
deploy:
	@echo 'Applying remote D1 migrations...'
	CI=true npx wrangler d1 migrations apply MY_DB --remote
	@echo 'Deploying Worker...'
	npm run deploy

# ==================================================================================== #
# DEVELOPMENT
# ==================================================================================== #

## deploy/local: apply local D1 migrations and start the local Worker
.PHONY: deploy/local
deploy/local:
	@echo 'Applying local D1 migrations...'
	CI=true npx wrangler d1 migrations apply MY_DB --local
	@echo 'Starting local Worker...'
	npm run dev
