# `generate-mandate` Deployment Notes

This edge function generates mandate `.docx` files and links the output to a packet document record.

## Required Runtime Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Template/Storage Variables (fallbacks)

- `MANDATE_TEMPLATE_PATH`
- `MANDATE_TEMPLATE_BUCKET`
- `MANDATE_OUTPUT_BUCKET`
- Optional shared bucket fallbacks:
  - `SUPABASE_DOCUMENTS_BUCKET`
  - `SUPABASE_DOCUMENT_BUCKET`
  - `DOCUMENTS_BUCKET`
  - `SUPABASE_STORAGE_BUCKET`

## Template Source Resolution Order

1. Request payload (`templatePath` / `templateBucket`)
2. Env fallback (`MANDATE_TEMPLATE_PATH` / `MANDATE_TEMPLATE_BUCKET`)
3. If missing, function returns `errorCode: MISSING_TEMPLATE_FILE`

## Failure Codes Returned

- `MISSING_TEMPLATE_FILE`
- `INVALID_TEMPLATE_FILE`
- `DOCX_RENDER_FAILED`
- `STORAGE_UPLOAD_FAILED`
- `DOCUMENT_RECORD_CREATE_FAILED`
- `MANDATE_GENERATION_FAILED`

## Deploy

```bash
npx supabase functions deploy generate-mandate --project-ref <your-project-ref>
```
