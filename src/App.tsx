import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './store/store'
import { AccessLog } from './ui/AccessLog'
import { CaseDetail } from './ui/CaseDetail'
import { Home } from './ui/Home'
import { Inbox } from './ui/Inbox'
import { Layout } from './ui/Layout'
import { MyCases } from './ui/MyCases'
import { NewReferral, Referrals } from './ui/Referrals'
import { Results } from './ui/Results'
import { ScrollToHash } from './ui/ScrollToHash'
import { Unit } from './ui/Unit'

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <ScrollToHash />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="cases" element={<MyCases />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="unit" element={<Unit />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="referrals/new" element={<NewReferral />} />
            <Route path="access-log" element={<AccessLog />} />
            <Route path="results" element={<Results />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  )
}
