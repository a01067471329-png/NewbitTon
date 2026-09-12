import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 실기기 Push 테스트용 임시 터널 허용 (테스트 끝나면 제거할 것)
  // 주의: allowedHosts: true는 이 Vite 버전에서 버그로 동작하지 않아서
  // (https://github.com/vitejs/vite/issues/19242) 와일드카드 패턴으로 지정한다.
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
})
