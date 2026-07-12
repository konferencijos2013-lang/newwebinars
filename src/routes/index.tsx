import { BrowserRouter, Routes, Route } from 'react-router'
import { PublicLayout } from '@/components/layout/PublicLayout'

// #region agent log
fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
  body: JSON.stringify({
    sessionId: '85756a',
    id: 'log_routes_module',
    runId: 'initial',
    hypothesisId: 'D',
    location: 'src/routes/index.tsx:1',
    message: 'Routes module loaded',
    data: {},
    timestamp: Date.now(),
  }),
}).catch(() => {})
// #endregion
import { AppShell } from '@/components/app/AppShell'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PricingPage } from '@/pages/PricingPage'
import { PartnersPage } from '@/pages/PartnersPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AuthCallbackPage } from '@/features/auth/pages/AuthCallbackPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { WebinarsPage } from '@/features/webinars/pages/WebinarsPage'
import { WebinarCreatePage } from '@/features/webinars/pages/WebinarCreatePage'
import { WebinarDetailPage } from '@/features/webinars/pages/WebinarDetailPage'
import { WebinarEditPage } from '@/features/webinars/pages/WebinarEditPage'
import { FunnelsPage } from '@/features/funnels/pages/FunnelsPage'
import { FunnelCreatePage } from '@/features/funnels/pages/FunnelCreatePage'
import { FunnelEditorPage } from '@/features/funnels/pages/FunnelEditorPage'
import { PublicWebinarPage } from '@/features/webinars/pages/PublicWebinarPage'
import { WaitingRoomPage } from '@/features/webinars/pages/WaitingRoomPage'
import { WebinarRoomPage } from '@/features/webinars/pages/WebinarRoomPage'
import { RecordingsPage } from '@/features/recordings/pages/RecordingsPage'
import { BillingPage } from '@/features/billing/pages/BillingPage'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'
import { AffiliatePage } from '@/features/affiliate/pages/AffiliatePage'
import { AnalyticsPage } from '@/features/analytics/pages/AnalyticsPage'
import { AiDashboardPage } from '@/features/ai/pages/AiDashboardPage'
import { AiChatPage } from '@/features/ai/pages/AiChatPage'
import { AiPromptsPage } from '@/features/ai/pages/AiPromptsPage'
import { AiPromptFormPage } from '@/features/ai/pages/AiPromptFormPage'
import { AdminRoute } from '@/features/auth/components/AdminRoute'

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public webinar funnel pages (no marketing wrapper) */}
        <Route path="w/:slug" element={<PublicWebinarPage />} />
        <Route path="w/:slug/waiting-room" element={<WaitingRoomPage />} />
        <Route path="w/:slug/room" element={<WebinarRoomPage />} />

        {/* Public marketing site */}
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Authenticated SaaS app */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="webinars" element={<WebinarsPage />} />
          <Route path="webinars/new" element={<WebinarCreatePage />} />
          <Route path="webinars/:id" element={<WebinarDetailPage />} />
          <Route path="webinars/:id/edit" element={<WebinarEditPage />} />
          <Route path="funnels" element={<FunnelsPage />} />
          <Route path="funnels/new" element={<FunnelCreatePage />} />
          <Route path="funnels/:id" element={<FunnelEditorPage />} />
          <Route path="recordings" element={<RecordingsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="affiliate" element={<AffiliatePage />} />
          <Route path="ai" element={<AiDashboardPage />} />
          <Route path="ai/chat" element={<AiChatPage />} />
          <Route
            path="ai/prompts"
            element={
              <AdminRoute>
                <AiPromptsPage />
              </AdminRoute>
            }
          />
          <Route
            path="ai/prompts/new"
            element={
              <AdminRoute>
                <AiPromptFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="ai/prompts/:id"
            element={
              <AdminRoute>
                <AiPromptFormPage />
              </AdminRoute>
            }
          />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
