# Shared API infrastructure

This directory contains only cross-domain primitives: Supabase client access, storage access, small error helpers, and schema-compatibility utilities.

`readHelpers.js` preserves the existing client/error/value helpers. `schemaReadCompatibility.js` owns the shared missing-column and missing-relation caches used by both domain reads and workflows. Keep one cache instance so an extraction does not change fallback behaviour or reset semantics.

`schemaCompatibility.js` also holds the existing bounded update fallback. `storage.js` preserves upload bucket selection and object removal for extracted workflows. These are persistence primitives; feature validation, actor selection, sequencing and recovery remain with the owning domain.

Do not put business workflows here. A domain module owns its repository, orchestration, mapping, and validation code.
