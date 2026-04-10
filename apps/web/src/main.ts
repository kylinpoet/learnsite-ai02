import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { useAppStore } from './stores/app';
import { useAuthStore } from './stores/auth';
import { authSessionExpiredEvent } from './stores/authSession';
import './styles/theme.css';
import './styles/base.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
const appStore = useAppStore(pinia);
appStore.initialize();

const authStore = useAuthStore(pinia);
authStore.initialize();

if (typeof window !== 'undefined') {
  window.addEventListener(authSessionExpiredEvent, () => {
    authStore.clearSession();
    const currentPath = router.currentRoute.value.path;
    if (currentPath.startsWith('/staff')) {
      void router.replace('/login/staff');
      return;
    }
    if (currentPath.startsWith('/student')) {
      void router.replace('/login/student');
    }
  });
}

app.use(router);

async function bootstrap() {
  await appStore.syncPlatformTitle();

  if (authStore.token) {
    try {
      await authStore.syncSessionUser(true);
    } catch {
      // Use the cached session snapshot if the profile refresh is temporarily unavailable.
    }
  }

  app.mount('#app');
}

void bootstrap();
