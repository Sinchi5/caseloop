import type { Role } from '../domain/types'

export const REPO_URL = 'https://github.com/Sinchi5/caseloop'

export const homeFor = (role: Role) => ({ caseworker: '/cases', supervisor: '/unit', police: '/referrals' })[role]
