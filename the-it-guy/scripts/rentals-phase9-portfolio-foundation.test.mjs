import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, page] = await Promise.all(['sql/20260829_rental_portfolio_foundation.sql', 'src/services/rentals/rentalPortfolioRepository.js', 'src/pages/rentals/RentalPortfoliosPage.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['create table if not exists public.rental_portfolios', 'create table if not exists public.rental_portfolio_properties', 'rental_portfolio_property_validate_scope', 'security_invoker = true', 'rental_portfolio_summaries', 'enable row level security']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings/i)
assert.match(repository, /from\('rental_portfolio_summaries'\)/)
assert.match(repository, /onConflict: 'property_id'/)
assert.match(page, /Properties and units load as one portfolio summary/)
console.log('Rentals Phase 9 portfolio foundation checks passed.')
