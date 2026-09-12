import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 실기기 Push 테스트용 임시 터널 허용 (테스트 끝나면 제거할 것)
  server: {
    allowedHosts: true,
  },
})
