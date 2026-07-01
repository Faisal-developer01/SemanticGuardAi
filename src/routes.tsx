import type { ReactNode } from 'react';

// Auth pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotificationsPage from './pages/NotificationsPage';
import LandingPage from './pages/LandingPage';
import ProfilePage from './pages/ProfilePage';
import VerifyCredential from './pages/VerifyCredential';

// Candidate pages
import CandidateDashboard from './pages/candidate/CandidateDashboard';
import AssessmentScreen from './pages/candidate/AssessmentScreen';
import AssessmentHistory from './pages/candidate/AssessmentHistory';
import AssessmentResults from './pages/candidate/AssessmentResults';
import CandidateProfile from './pages/candidate/CandidateProfile';
import Certificates from './pages/candidate/Certificates';

// Recruiter pages
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard';
import CreateAssessment from './pages/recruiter/CreateAssessment';
import EditAssessment from './pages/recruiter/EditAssessment';
import ManageQuestions from './pages/recruiter/ManageQuestions';
import LiveMonitoring from './pages/recruiter/LiveMonitoring';
import AIAlertPanel from './pages/recruiter/AIAlertPanel';
import RecruiterReports from './pages/recruiter/RecruiterReports';
import SessionReview from './pages/recruiter/SessionReview';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import AssessmentManagement from './pages/admin/AssessmentManagement';
import AdminMonitoring from './pages/admin/AdminMonitoring';
import AIDetectionDashboard from './pages/admin/AIDetectionDashboard';
import AnalyticsDashboard from './pages/admin/AnalyticsDashboard';
import AuditLogs from './pages/admin/AuditLogs';
import SystemSettings from './pages/admin/SystemSettings';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  // Root - Landing page
  { name: 'Landing', path: '/', element: <LandingPage />, public: true },

  // Auth
  { name: 'Login', path: '/login', element: <LoginPage />, public: true },
  { name: 'Register', path: '/register', element: <RegisterPage />, public: true },

  // Public credential verification (QR-code landing)
  { name: 'Verify Credential', path: '/verify/:token', element: <VerifyCredential />, public: true },

  // Candidate module
  { name: 'Candidate Dashboard', path: '/candidate/dashboard', element: <CandidateDashboard /> },
  { name: 'Assessment Screen', path: '/candidate/assessment', element: <AssessmentScreen /> },
  { name: 'Assessment Screen', path: '/candidate/assessment/:assessmentId', element: <AssessmentScreen /> },
  { name: 'Assessment History', path: '/candidate/history', element: <AssessmentHistory /> },
  { name: 'Assessment Results', path: '/candidate/results/:sessionId', element: <AssessmentResults /> },
  { name: 'Certificates', path: '/candidate/certificates', element: <Certificates /> },
  { name: 'Candidate Profile', path: '/candidate/profile', element: <CandidateProfile /> },

  // Recruiter module
  { name: 'Recruiter Dashboard', path: '/recruiter/dashboard', element: <RecruiterDashboard /> },
  { name: 'Create Assessment', path: '/recruiter/create-assessment', element: <CreateAssessment /> },
  { name: 'Edit Assessment', path: '/recruiter/edit-assessment/:assessmentId', element: <EditAssessment /> },
  { name: 'Manage Questions', path: '/recruiter/questions', element: <ManageQuestions /> },
  { name: 'Live Monitoring', path: '/recruiter/monitoring', element: <LiveMonitoring /> },
  { name: 'AI Alert Panel', path: '/recruiter/alerts', element: <AIAlertPanel /> },
  { name: 'Session Review', path: '/recruiter/review/:sessionId', element: <SessionReview /> },
  { name: 'Recruiter Reports', path: '/recruiter/reports', element: <RecruiterReports /> },
  { name: 'Recruiter Profile', path: '/recruiter/profile', element: <ProfilePage /> },

  // Notifications (all roles)
  { name: 'Notifications', path: '/candidate/notifications', element: <NotificationsPage /> },
  { name: 'Notifications', path: '/recruiter/notifications', element: <NotificationsPage /> },
  { name: 'Notifications', path: '/admin/notifications', element: <NotificationsPage /> },

  // Admin module
  { name: 'Admin Dashboard', path: '/admin/dashboard', element: <AdminDashboard /> },
  { name: 'User Management', path: '/admin/users', element: <UserManagement /> },
  { name: 'Assessment Management', path: '/admin/assessments', element: <AssessmentManagement /> },
  { name: 'Admin Monitoring', path: '/admin/monitoring', element: <AdminMonitoring /> },
  { name: 'AI Detection', path: '/admin/ai-detection', element: <AIDetectionDashboard /> },
  { name: 'Analytics', path: '/admin/analytics', element: <AnalyticsDashboard /> },
  { name: 'Audit Logs', path: '/admin/audit-logs', element: <AuditLogs /> },
  { name: 'System Settings', path: '/admin/settings', element: <SystemSettings /> },
  { name: 'Admin Profile', path: '/admin/profile', element: <ProfilePage /> },
];
