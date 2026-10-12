import { isTV } from '@/hooks/usePlatform';
import LoginViewTV from './LoginViewTV';
import LoginViewWeb from './LoginViewWeb';

export default function LoginView() {
  const isTvMode = isTV();
  return isTvMode ? <LoginViewTV /> : <LoginViewWeb />;
}
