import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
import { APP_NAME } from '@/lib/brand';

export default function RootLoading() {
  return <AuthBootScreen message={`جاري تحميل ${APP_NAME}...`} />;
}
