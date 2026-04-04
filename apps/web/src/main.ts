import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

import App from './App.vue';
import router from './router';
import { useAppStore } from './stores/app';
import { useAuthStore } from './stores/auth';
import './styles/theme.css';
import './styles/base.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
useAppStore(pinia).initialize();

const authStore = useAuthStore(pinia);
authStore.initialize();

app.use(router);
app.use(ElementPlus);

async function bootstrap() {
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
