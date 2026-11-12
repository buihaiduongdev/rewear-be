process.env.NODE_ENV ??= 'test';
process.env.DOTENV_CONFIG_QUIET ??= 'true';
process.env.JWT_ACCESS_SECRET ??= 'rewear-test-access-secret-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'rewear-test-refresh-secret-32-characters';
process.env.GOOGLE_CLIENT_ID ??= 'rewear-test.apps.googleusercontent.com';
process.env.STORAGE_ENDPOINT ??= 'https://storage.example.test';
process.env.STORAGE_ACCESS_KEY_ID ??= 'test-access-key';
process.env.STORAGE_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.STORAGE_BUCKET ??= 'rewear-test';
process.env.STORAGE_PUBLIC_BASE_URL ??= 'https://storage.example.test';
process.env.MAIL_HOST ??= '127.0.0.1';
process.env.MAIL_PORT ??= '1025';
process.env.MAIL_USER ??= 'rewear-test';
process.env.MAIL_PASS ??= 'rewear-test';
process.env.MAIL_FROM ??= 'test@example.test';
process.env.FRONTEND_URL ??= 'http://localhost:5000';

const databaseName = process.env.DB_NAME;
const databaseHost = process.env.DB_HOST ?? 'localhost';
if (
  databaseName &&
  /^rewear[a-z0-9_]*_test$/.test(databaseName) &&
  ['localhost', '127.0.0.1', '::1'].includes(databaseHost)
) {
  const url = new URL('postgresql://localhost');
  url.username = process.env.DB_USERNAME ?? 'postgres';
  url.password = process.env.DB_PASSWORD ?? 'postgres';
  url.hostname = databaseHost;
  url.port = process.env.DB_PORT ?? '5432';
  url.pathname = `/${databaseName}`;
  url.searchParams.set(
    'sslmode',
    process.env.DB_SSL === 'true' ? 'require' : 'disable',
  );
  process.env.DATABASE_URL = url.toString();
}
