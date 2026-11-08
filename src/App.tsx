import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/auth-context'
import { ProtectedRoute } from '@/components/protected-route'
import { TeacherLayout } from '@/components/teacher-layout'
import { StudentLayout } from '@/components/student-layout'
import { LoginPage } from '@/pages/login'
import { ForgotPasswordPage } from '@/pages/forgot-password'
import { TeacherDashboard } from '@/pages/teacher/dashboard'
import { ClassesPage } from '@/pages/teacher/classes'
import { ClassDetailPage } from '@/pages/teacher/class-detail'
import { MaterialsPage } from '@/pages/teacher/materials'
import { ModulesPage } from '@/pages/teacher/modules'
import { AssignmentsPage } from '@/pages/teacher/assignments'
import { QuestionBanksPage } from '@/pages/teacher/question-banks'
import { QuestionBankDetailPage } from '@/pages/teacher/question-bank-detail'
import { ExamsPage } from '@/pages/teacher/exams'
import { ExamDetailPage } from '@/pages/teacher/exam-detail'
import { ExamCreatePage } from '@/pages/teacher/exam-create'
import { GradingPage } from '@/pages/teacher/grading'
import { AnalyticsPage } from '@/pages/teacher/analytics'
import { SettingsPage } from '@/pages/teacher/settings'
import { StudentDashboard } from '@/pages/student/dashboard'
import { StudentMaterialsPage } from '@/pages/student/materials'
import { StudentModulesPage } from '@/pages/student/modules'
import { StudentAssignmentsPage } from '@/pages/student/assignments'
import { StudentExamsPage } from '@/pages/student/exams'
import { ExamAttemptPage } from '@/pages/student/exam-attempt'
import { StudentGradesPage } from '@/pages/student/grades'
import { StudentProfilePage } from '@/pages/student/profile'

export function App() {
  return (
    // basename mengikuti BASE_URL ("/" saat dev, "/<repo>/" saat build GitHub Pages)
    // agar semua navigasi tetap berada di bawah base path.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Teacher routes */}
          <Route path="/teacher" element={
            <ProtectedRoute requireTeacher>
              <TeacherLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/teacher/dashboard" replace />} />
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/:classId" element={<ClassDetailPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="question-banks" element={<QuestionBanksPage />} />
            <Route path="question-banks/:bankId" element={<QuestionBankDetailPage />} />
            <Route path="exams" element={<ExamsPage />} />
            <Route path="exams/new" element={<ExamCreatePage />} />
            <Route path="exams/:examId" element={<ExamDetailPage />} />
            <Route path="grading" element={<GradingPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Student routes */}
          <Route path="/student" element={
            <ProtectedRoute>
              <StudentLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="materials" element={<StudentMaterialsPage />} />
            <Route path="modules" element={<StudentModulesPage />} />
            <Route path="assignments" element={<StudentAssignmentsPage />} />
            <Route path="exams" element={<StudentExamsPage />} />
            <Route path="grades" element={<StudentGradesPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
          </Route>

          {/* Exam attempt - standalone full screen */}
          <Route path="/student/exam-attempts/:attemptId" element={
            <ProtectedRoute>
              <ExamAttemptPage />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
