# Import providers

JSON-LD import is deterministic and does not call a paid API. It reads `schema.org/Recipe` from the page, including a top-level array or `@graph`, and normalizes whatever fields are present. Missing amounts, times, and groups stay empty. The result is a draft until someone saves it.

## OpenRouter, optional

Set these only when you want unstructured pages or photo OCR:

```bash
RECIPE_EXTRACT_PROVIDER=openrouter
OPENROUTER_API_KEY=...          # server secret store, never git
OPENROUTER_MODEL=...            # required; this app does not pick a model
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MAX_TOKENS=1800      # hard ceiling 4096
OPENROUTER_TIMEOUT_MS=25000     # hard ceiling 60000
```

The adapter calls `POST https://openrouter.ai/api/v1/chat/completions` with `temperature: 0`, `response_format.type=json_schema`, `strict: true`, and `provider.require_parameters=true`. Text is capped at 12,000 characters. Images are re-encoded to JPEG, resized, and rejected above 3.5 MB before the request. There is no retry. The response is parsed and checked again with zod. If the shape is wrong, or the model returns no recipe, nothing is saved.

A Claude Pro subscription used for development does not provide this runtime key. Leave the provider at `none` and both the photo page and unstructured import say that configuration is required.

`OPENROUTER_BASE_URL` must stay on `https://openrouter.ai/api/v1`. Other hosts are rejected so the key is not sent to an internal address.

Vendor-specific code is in `src/server/import/providers/openrouter.ts`. Another provider would implement `ExtractionProvider` and be selected from `src/server/import/providers/registry.ts`.
