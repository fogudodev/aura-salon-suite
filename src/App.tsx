import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Bookings from "./pages/Bookings";
import Services from "./pages/Services";
import Clients from "./pages/Clients";
import Automations from "./pages/Automations";
import Finance from "./pages/Finance";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import PublicPage from "./pages/PublicPage";
import PublicBooking from "./pages/PublicBooking";
import Team from "./pages/Team";
import Products from "./pages/Products";
import Coupons from "./pages/Coupons";

import Reviews from "./pages/Reviews";
import CommissionReport from "./pages/CommissionReport";
import TeamPerformance from "./pages/TeamPerformance";
import Campaigns from "./pages/Campaigns";
import PaymentChat from "./pages/PaymentChat";
import SupportChat from "./pages/SupportChat";
import AIAssistant from "./pages/AIAssistant";
import CashRegister from "./pages/CashRegister";
import Waitlist from "./pages/Waitlist";
import ServicePackages from "./pages/ServicePackages";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Instructions from "./pages/Instructions";
import UpsellConfig from "./pages/UpsellConfig";
import UpsellDashboard from "./pages/UpsellDashboard";
import Rewards from "./pages/Rewards";
import Reactivation from "./pages/Reactivation";
import SystemGuide from "./pages/SystemGuide";
import InstagramAutomation from "./pages/InstagramAutomation";
import InstagramCallback from "./pages/InstagramCallback";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import Courses from "./pages/Courses";
import CourseClasses from "./pages/CourseClasses";
import CourseStudents from "./pages/CourseStudents";
import CourseDashboard from "./pages/CourseDashboard";
import CourseCertificates from "./pages/CourseCertificates";
import CourseFinance from "./pages/CourseFinance";
import CourseWaitlist from "./pages/CourseWaitlist";
import StudentArea from "./pages/StudentArea";
import PublicCourses from "./pages/PublicCourses";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminSubscribers from "./pages/admin/AdminSubscribers";
import AdminIntegrations from "./pages/admin/AdminIntegrations";
import AdminFeatures from "./pages/admin/AdminFeatures";
import AdminFeatureFlags from "./pages/admin/AdminFeatureFlags";
import AdminBookings from "./pages/admin/AdminBookings";
import AdminWhatsAppPage from "./pages/admin/AdminWhatsAppPage";
import AdminWhatsAppLogsPage from "./pages/admin/AdminWhatsAppLogsPage";
import AdminPlanLimits from "./pages/admin/AdminPlanLimits";
import AdminProfessionalLimits from "./pages/admin/AdminProfessionalLimits";
import AdminMessageUsagePage from "./pages/admin/AdminMessageUsagePage";
import AdminLogsPage from "./pages/admin/AdminLogsPage";
import AdminSupportChat from "./pages/admin/AdminSupportChat";
import AdminPaymentChat from "./pages/admin/AdminPaymentChat";
import AdminPlatformReviews from "./pages/admin/AdminPlatformReviews";

const queryClient = new QueryClient();

const AppContent = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ImpersonationBanner />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/landing" element={<Landing />} />
            
            {/* Professional routes */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
            <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/public-page" element={<ProtectedRoute><PublicPage /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
            <Route path="/coupons" element={<ProtectedRoute><Coupons /></ProtectedRoute>} />
            <Route path="/payment-settings" element={<Navigate to="/settings" replace />} />
            <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
            <Route path="/commission-report" element={<ProtectedRoute><CommissionReport /></ProtectedRoute>} />
            <Route path="/team-performance" element={<ProtectedRoute><TeamPerformance /></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/payment-chat" element={<ProtectedRoute><PaymentChat /></ProtectedRoute>} />
            <Route path="/support-chat" element={<ProtectedRoute><SupportChat /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
            <Route path="/cash-register" element={<ProtectedRoute><CashRegister /></ProtectedRoute>} />
            <Route path="/waitlist" element={<ProtectedRoute><Waitlist /></ProtectedRoute>} />
            <Route path="/service-packages" element={<ProtectedRoute><ServicePackages /></ProtectedRoute>} />
            <Route path="/instructions" element={<ProtectedRoute><Instructions /></ProtectedRoute>} />
            <Route path="/upsell" element={<ProtectedRoute><UpsellDashboard /></ProtectedRoute>} />
            <Route path="/upsell/config" element={<ProtectedRoute><UpsellConfig /></ProtectedRoute>} />
            <Route path="/guia" element={<SystemGuide />} />
            <Route path="/instagram-automation" element={<ProtectedRoute><InstagramAutomation /></ProtectedRoute>} />
            <Route path="/rewards" element={<ProtectedRoute><Rewards /></ProtectedRoute>} />
            <Route path="/instagram-callback" element={<InstagramCallback />} />
            <Route path="/courses" element={<ProtectedRoute><CourseDashboard /></ProtectedRoute>} />
            <Route path="/courses/list" element={<ProtectedRoute><Courses /></ProtectedRoute>} />
            <Route path="/courses/classes" element={<ProtectedRoute><CourseClasses /></ProtectedRoute>} />
            <Route path="/courses/students" element={<ProtectedRoute><CourseStudents /></ProtectedRoute>} />
            <Route path="/courses/certificates" element={<ProtectedRoute><CourseCertificates /></ProtectedRoute>} />
            <Route path="/courses/finance" element={<ProtectedRoute><CourseFinance /></ProtectedRoute>} />
            <Route path="/courses/waitlist" element={<ProtectedRoute><CourseWaitlist /></ProtectedRoute>} />

            {/* Admin Master routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/plans" element={<AdminRoute><AdminPlans /></AdminRoute>} />
            <Route path="/admin/subscribers" element={<AdminRoute><AdminSubscribers /></AdminRoute>} />
            <Route path="/admin/integrations" element={<AdminRoute><AdminIntegrations /></AdminRoute>} />
            <Route path="/admin/features" element={<AdminRoute><AdminFeatures /></AdminRoute>} />
            <Route path="/admin/bookings" element={<AdminRoute><AdminBookings /></AdminRoute>} />
            <Route path="/admin/whatsapp" element={<AdminRoute><AdminWhatsAppPage /></AdminRoute>} />
            <Route path="/admin/whatsapp-logs" element={<AdminRoute><AdminWhatsAppLogsPage /></AdminRoute>} />
            <Route path="/admin/plan-limits" element={<AdminRoute><AdminPlanLimits /></AdminRoute>} />
            <Route path="/admin/professional-limits" element={<AdminRoute><AdminProfessionalLimits /></AdminRoute>} />
            <Route path="/admin/message-usage" element={<AdminRoute><AdminMessageUsagePage /></AdminRoute>} />
            <Route path="/admin/logs" element={<AdminRoute><AdminLogsPage /></AdminRoute>} />
            <Route path="/admin/support-chat" element={<AdminRoute><AdminSupportChat /></AdminRoute>} />
            <Route path="/admin/payment-chat" element={<AdminRoute><AdminPaymentChat /></AdminRoute>} />
            <Route path="/admin/platform-reviews" element={<AdminRoute><AdminPlatformReviews /></AdminRoute>} />
            <Route path="/admin/feature-flags" element={<AdminRoute><AdminFeatureFlags /></AdminRoute>} />

            {/* Public routes */}
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/termos-de-uso" element={<TermsOfUse />} />
            <Route path="/area-do-aluno" element={<StudentArea />} />
            <Route path="/cursos/:slug" element={<PublicCourses />} />
            <Route path="/:slug" element={<PublicBooking />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <AppContent />
  </ThemeProvider>
);

export default App;
