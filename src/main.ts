import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/palette.css'
import './styles/ui.css'

createApp(App).use(createPinia()).mount('#app')
