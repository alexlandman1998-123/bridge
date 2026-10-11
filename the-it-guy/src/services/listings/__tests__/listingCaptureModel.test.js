import { expect, it } from 'vitest'
import { PROPERTY_CATEGORIES } from '../../../lib/propertyTaxonomy'
import { salesCategoryChange, salesPropertyTypeOptions, salesPropertyTypeMatches, salesPropertyTypeIssue } from '../listingCaptureModel'
it('offers only compatible types after moving a House through every category', () => {
 for (const category of PROPERTY_CATEGORIES) {
  const form = salesCategoryChange({ propertyCategory: 'residential', propertyType: 'House' }, category)
  expect(salesPropertyTypeMatches(category, form.propertyType)).toBe(true)
  if (category !== 'residential') expect(form.propertyType).not.toBe('House')
  expect(salesPropertyTypeIssue(form)).toBeNull()
 }
})
it('preserves valid legacy spellings but requires correction of incompatible saved types', () => {
 expect(salesPropertyTypeMatches('commercial', 'Office')).toBe(true)
 expect(salesCategoryChange({ propertyType: 'Office' }, 'commercial').propertyType).toBe('Office')
 expect(salesPropertyTypeIssue({ propertyCategory: 'industrial', propertyType: 'House' })?.field).toBe('propertyType')
 expect(salesPropertyTypeOptions('residential').some(x => x.value === 'vacant_stand')).toBe(false)
})
