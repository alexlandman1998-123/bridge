# Shared API infrastructure

This directory contains only cross-domain primitives: Supabase client access, storage access, small error helpers, and schema-compatibility utilities.

Do not put business workflows here. A domain module owns its repository, orchestration, mapping, and validation code.
