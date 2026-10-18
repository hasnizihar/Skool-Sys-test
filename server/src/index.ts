import { app } from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 SkoolSys API Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready for local school network & PWA clients`);
});
