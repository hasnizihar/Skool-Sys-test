"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_js_1 = require("./db/database.js");
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const academic_js_1 = __importDefault(require("./routes/academic.js"));
const students_js_1 = __importDefault(require("./routes/students.js"));
const attendance_js_1 = __importDefault(require("./routes/attendance.js"));
const marks_js_1 = __importDefault(require("./routes/marks.js"));
const admin_js_1 = __importDefault(require("./routes/admin.js"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Initialize SQLite Schema
(0, database_js_1.initDatabase)();
// Middleware
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        system: 'SkoolSys Management System MVP',
        timestamp: new Date().toISOString()
    });
});
// Mount Routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/academic', academic_js_1.default);
app.use('/api/students', students_js_1.default);
app.use('/api/attendance', attendance_js_1.default);
app.use('/api/marks', marks_js_1.default);
app.use('/api/admin', admin_js_1.default);
// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred.'
    });
});
app.listen(PORT, () => {
    console.log(`🚀 SkoolSys API Server running on http://localhost:${PORT}`);
    console.log(`📡 Ready for local school network & PWA clients`);
});
