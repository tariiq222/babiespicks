# Dify Workflows

## Discovery Flow

File: `discovery-flow.yml`

### Import

1. In Dify, go to **Studio → Create from DSL → Upload File**.
2. Select `discovery-flow.yml`.
3. After import, open the workflow and configure environment variables (right panel → Environment Variables):
   - `NESTJS_BASE` = `https://api.babiespicks.com` (or staging URL)
   - `DIFY_API_TOKEN` = (matches the NestJS `DIFY_API_TOKEN` env var)
4. Install required tools from Dify Marketplace if not already present:
   - Tavily
   - Reddit
   - YouTube
5. Provide API keys for each tool in Dify Settings → Tool Providers.

### Trigger

- Manual: in the workflow editor, click Run.
- Programmatic: `POST {DIFY_BASE}/v1/workflows/run` with the Dify API key from Dify → Tools → API Access.

### Output

Workflow returns `{ processed: [...] }`. Each item is the JSON response from `process-product`, including `product_id` and `content_page_id`. All data also lives in the NestJS DB.

### Important Caveat

Dify's exact DSL schema evolves. If import fails on this YAML, build the workflow manually using the structure above as a blueprint.
