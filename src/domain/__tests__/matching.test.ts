import { describe, expect, it } from 'vitest'
import { compareDob, findMatches, jaroWinkler, normalizeAddress, scoreMatch } from '../matching'
import { REGISTRY } from '../seed'
import type { RegistryPerson } from '../types'

const known = (p: Partial<RegistryPerson>): RegistryPerson => ({
  id: 'k',
  firstName: 'Jalen',
  lastName: 'Carter',
  dob: '2016-04-03',
  address: '14 Elm Street',
  priorReports: [],
  ...p,
})

describe('jaroWinkler', () => {
  it('matches the published reference values', () => {
    // Winkler (1990) examples
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961, 3)
    expect(jaroWinkler('DWAYNE', 'DUANE')).toBeCloseTo(0.84, 2)
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813, 3)
  })
  it('is 1 for identical, 0 for nothing in common, and ignores case', () => {
    expect(jaroWinkler('Carter', 'carter')).toBe(1)
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
  })
})

describe('normalizeAddress', () => {
  it('treats abbreviations, punctuation and unit numbers as the same place', () => {
    expect(normalizeAddress('14 Elm St., Apt 2')).toBe(normalizeAddress('14 Elm Street'))
    expect(normalizeAddress('310 Lake Rd #4')).toBe('310 lake road 4') // bare "#4" kept: we only drop labelled units
  })
})

describe('compareDob', () => {
  it('spots the two common data-entry mistakes', () => {
    expect(compareDob('1990-07-11', '1990-11-07')).toBe('day-month-swapped')
    expect(compareDob('2016-04-03', '2016-04-08')).toBe('one-digit-off')
    expect(compareDob('2016-04-03', '2009-12-12')).toBe('different')
  })
})

/**
 * Labelled pairs. "same" means a careful worker would say these are one person.
 * The bar: every "same" pair is flagged, no "different" pair is.
 */
const PAIRS: { label: string; incoming: { firstName: string; lastName: string; dob: string; address: string }; known: Partial<RegistryPerson>; truth: 'same' | 'different' }[] = [
  { label: 'exact', incoming: { firstName: 'Jalen', lastName: 'Carter', dob: '2016-04-03', address: '14 Elm Street' }, known: {}, truth: 'same' },
  { label: 'first name spelled differently', incoming: { firstName: 'Jaylen', lastName: 'Carter', dob: '2016-04-03', address: '14 Elm St., Apt 2' }, known: {}, truth: 'same' },
  { label: 'moved house', incoming: { firstName: 'Jalen', lastName: 'Carter', dob: '2016-04-03', address: '900 New Road' }, known: {}, truth: 'same' },
  { label: 'day and month swapped', incoming: { firstName: 'Marcus', lastName: 'Bell', dob: '1990-07-11', address: '220 Ridge Road' }, known: { firstName: 'Markus', lastName: 'Bell', dob: '1990-11-07', address: '220 Ridge Road' }, truth: 'same' },
  { label: 'last name typo', incoming: { firstName: 'Jordan', lastName: 'Pryce', dob: '2012-08-30', address: '77 Hill Avenue' }, known: { firstName: 'Jordan', lastName: 'Price', dob: '2012-08-30', address: '77 Hill Ave' }, truth: 'same' },
  { label: 'sibling: same family, same address, different child', incoming: { firstName: 'Jada', lastName: 'Carter', dob: '2019-09-15', address: '14 Elm Street' }, known: {}, truth: 'different' },
  { label: 'similar name, different person', incoming: { firstName: 'Noah', lastName: 'Grant', dob: '2017-10-05', address: '18 Birch Place' }, known: { firstName: 'Noah', lastName: 'Grantham', dob: '2009-12-12', address: '41 Oak Court' }, truth: 'different' },
  { label: 'twins: same birthday and address, different first name', incoming: { firstName: 'Maya', lastName: 'Carter', dob: '2016-04-03', address: '14 Elm Street' }, known: {}, truth: 'different' },
]

describe('scoreMatch on labelled pairs', () => {
  for (const p of PAIRS) {
    it(`${p.truth === 'same' ? 'flags' : 'does not flag'}: ${p.label}`, () => {
      const r = scoreMatch(p.incoming, known(p.known))
      if (p.truth === 'same') expect(r.level).not.toBe('none')
      else expect(r.level).toBe('none')
    })
  }

  it('always says why', () => {
    const r = scoreMatch({ firstName: 'Jaylen', lastName: 'Carter', dob: '2016-04-03', address: '14 Elm St' }, known({}))
    expect(r.level).toBe('likely')
    expect(r.reasons).toContain('Same date of birth')
    expect(r.reasons).toContain('Same address as a prior report')
    expect(r.reasons.some((x) => x.includes('Jaylen / Jalen'))).toBe(true)
  })
})

describe('findMatches against the demo registry', () => {
  it('finds the known person for the demo cases and nothing for a new family', () => {
    expect(findMatches({ firstName: 'Destiny', lastName: 'Ward', dob: '2015-06-21', address: '310 Lake Road, Apt 4' }, REGISTRY)[0]?.candidate.id).toBe('r-5')
    expect(findMatches({ firstName: 'Ava', lastName: 'Bell', dob: '2023-05-02', address: '220 Ridge Road' }, REGISTRY)).toHaveLength(0)
  })
})
