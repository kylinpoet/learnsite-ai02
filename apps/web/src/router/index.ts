import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const AuthLayout = () => import('@/layouts/auth/AuthLayout.vue');
const StudentLayout = () => import('@/layouts/student/StudentLayout.vue');
const StaffLayout = () => import('@/layouts/staff/StaffLayout.vue');

const StudentLoginPage = () => import('@/modules/auth/StudentLoginPage.vue');
const StaffLoginPage = () => import('@/modules/auth/StaffLoginPage.vue');
const RulesPage = () => import('@/modules/public-pages/RulesPage.vue');

const StudentHomePage = () => import('@/modules/student-home/StudentHomePage.vue');
const CourseDetailPage = () => import('@/modules/student-course/CourseDetailPage.vue');
const ReadingTaskPage = () => import('@/modules/student-reading/ReadingTaskPage.vue');
const TaskPage = () => import('@/modules/student-task/TaskPage.vue');
const ProgramTaskPage = () => import('@/modules/student-task/ProgramTaskPage.vue');
const PeerReviewPage = () => import('@/modules/student-review/PeerReviewPage.vue');
const WorkListPage = () => import('@/modules/student-work/WorkListPage.vue');
const WorkDetailPage = () => import('@/modules/student-work/WorkDetailPage.vue');
const QuizHomePage = () => import('@/modules/student-quiz/QuizHomePage.vue');
const QuizRankingsPage = () => import('@/modules/student-quiz/QuizRankingsPage.vue');
const TypingHomePage = () => import('@/modules/student-typing/TypingHomePage.vue');
const TypingRankingsPage = () => import('@/modules/student-typing/TypingRankingsPage.vue');
const ResourcePage = () => import('@/modules/student-resource/ResourcePage.vue');
const DrivePage = () => import('@/modules/student-drive/DrivePage.vue');
const GroupPage = () => import('@/modules/student-group/GroupPage.vue');
const ProfilePage = () => import('@/modules/student-profile/ProfilePage.vue');

const StaffDashboardPage = () => import('@/modules/staff-dashboard/StaffDashboardPage.vue');
const ClassroomPage = () => import('@/modules/staff-classroom/ClassroomPage.vue');
const StaffAttendancePage = () => import('@/modules/staff-attendance/StaffAttendancePage.vue');
const StaffStudentPage = () => import('@/modules/staff-student/StaffStudentPage.vue');
const StaffAssistantPage = () => import('@/modules/staff-assistant/StaffAssistantPage.vue');
const LessonPlanPage = () => import('@/modules/staff-lesson-plan/LessonPlanPage.vue');
const StaffCurriculumPage = () => import('@/modules/staff-curriculum/StaffCurriculumPage.vue');
const SubmissionOverviewPage = () => import('@/modules/staff-submission/SubmissionOverviewPage.vue');
const SubmissionTaskPage = () => import('@/modules/staff-submission/SubmissionTaskPage.vue');
const AdminSystemPage = () => import('@/modules/staff-admin/AdminSystemPage.vue');
const StaffQuizPage = () => import('@/modules/staff-quiz/StaffQuizPage.vue');
const StaffTypingPage = () => import('@/modules/staff-typing/StaffTypingPage.vue');
const StaffResourcePage = () => import('@/modules/staff-resource/StaffResourcePage.vue');

type StoredUser = {
  role: string;
  roles?: string[];
};

function hasRole(user: StoredUser | null, role: string) {
  if (!user) {
    return false;
  }
  return Array.isArray(user.roles) ? user.roles.includes(role) : user.role === role;
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login/student' },
  {
    path: '/login',
    component: AuthLayout,
    children: [
      { path: 'student', component: StudentLoginPage },
      { path: 'staff', component: StaffLoginPage },
    ],
  },
  {
    path: '/rules',
    component: AuthLayout,
    children: [{ path: '', component: RulesPage }],
  },
  {
    path: '/student',
    component: StudentLayout,
    children: [
      { path: '', redirect: '/student/home' },
      { path: 'home', component: StudentHomePage },
      { path: 'courses/:courseId', component: CourseDetailPage },
      { path: 'courses/:courseId/readings/:taskId', component: ReadingTaskPage },
      { path: 'courses/:courseId/tasks/:taskId', component: TaskPage },
      { path: 'courses/:courseId/programs/:taskId', component: ProgramTaskPage },
      { path: 'reviews/:taskId', component: PeerReviewPage },
      { path: 'work', component: WorkListPage },
      { path: 'work/:submissionId', component: WorkDetailPage },
      { path: 'quiz', component: QuizHomePage },
      { path: 'quiz/rankings', component: QuizRankingsPage },
      { path: 'typing', component: TypingHomePage },
      { path: 'typing/rankings', component: TypingRankingsPage },
      { path: 'resources', component: ResourcePage },
      { path: 'drive', component: DrivePage },
      { path: 'groups', component: GroupPage },
      { path: 'profile', component: ProfilePage },
      { path: 'profile/:section', component: ProfilePage },
    ],
  },
  {
    path: '/staff',
    component: StaffLayout,
    children: [
      { path: '', redirect: '/staff/dashboard' },
      { path: 'dashboard', component: StaffDashboardPage },
      { path: 'classroom', component: ClassroomPage },
      { path: 'classroom/:sessionId', component: ClassroomPage },
      { path: 'lesson-plans', component: LessonPlanPage },
      { path: 'lesson-plans/:planId', component: LessonPlanPage },
      { path: 'curriculum', component: StaffCurriculumPage },
      { path: 'assistants', component: StaffAssistantPage },
      { path: 'submissions', component: SubmissionOverviewPage },
      { path: 'submissions/:taskId', component: SubmissionTaskPage },
      { path: 'attendance', component: StaffAttendancePage },
      { path: 'students', component: StaffStudentPage },
      { path: 'quizzes', component: StaffQuizPage },
      { path: 'typing', component: StaffTypingPage },
      { path: 'resources', component: StaffResourcePage },
      { path: 'admin/system', component: AdminSystemPage },
      { path: 'admin/ai-providers', component: AdminSystemPage },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (
    authStore.token &&
    (to.path.startsWith('/student')
      || to.path.startsWith('/staff')
      || to.path === '/login/student'
      || to.path === '/login/staff')
  ) {
    try {
      await authStore.syncSessionUser();
    } catch {
      // Fall back to the last cached session snapshot if the sync request fails.
    }
  }

  const user = authStore.user;
  const sessionExists = authStore.isAuthenticated;

  if (to.path.startsWith('/student') && (!sessionExists || user?.role !== 'student')) {
    return '/login/student';
  }

  if (to.path.startsWith('/staff') && (!sessionExists || user?.role !== 'staff')) {
    return '/login/staff';
  }

  if (to.path.startsWith('/staff/admin') && !hasRole(user, 'admin')) {
    return '/staff/dashboard';
  }

  if (to.path === '/login/student' && sessionExists && user?.role === 'student') {
    return '/student/home';
  }

  if (to.path === '/login/staff' && sessionExists && user?.role === 'staff') {
    return '/staff/dashboard';
  }

  return true;
});

export default router;
