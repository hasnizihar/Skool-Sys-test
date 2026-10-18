import { app } from './app.js';
import { getJwtSecret } from './middleware/auth.js';

// Strict Startup Verification: Fail fast if security configuration is missing or weak
try {
  getJwtSecret();
} catch (err: any) {
  console.error('\n❌ SERVER STARTUP HALTED DUE TO SECURITY POLICY:');
  console.error(err.message);
  console.error('Please configure a secure JWT_SECRET of at least 32 characters in your environment.\n');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 SkoolSys API Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready for local school network & PWA clients`);
});
