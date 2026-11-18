# SeeFixit — Implementation Matrix
> Last updated: 2026-11-19 | Audited from actual codebase

| Module | Feature | Status | Evidence | Migration | API Endpoint | Frontend Component | Tests | Remaining Work |
|--------|---------|--------|---------|-----------|-------------|-------------------|-------|----------------|
| **Foundation** | Express backend | ✅ IMPLEMENTED | `backend/server.js` | — | — | — | ✓ | — |
| **Foundation** | PostgreSQL/Neon | ✅ IMPLEMENTED | `backend/config/config.js` | 000 | — | — | ✓ | — |
| **Foundation** | Migration system | ✅ IMPLEMENTED | `backend/db/migrations/` | 000–009 | — | — | — | Apply 008–009 to Neon |
| **Auth** | Email registration | ✅ IMPLEMENTED | `authService.js` | 000, 002 | POST /api/auth/register | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Email login | ✅ IMPLEMENTED | `authService.js` | 000 | POST /api/auth/login | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Google Sign-In | ✅ IMPLEMENTED | `authService.js` | 006 | POST /api/auth/google | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Refresh tokens | ✅ IMPLEMENTED | `sessionService.js` | 007 | POST /api/auth/refresh | `api.js` | ✓ | — |
| **Auth** | Logout | ✅ IMPLEMENTED | `authRoutes.js` | — | POST /api/auth/logout | `App.jsx` | ✓ | — |
| **Security** | RBAC middleware | ✅ IMPLEMENTED | `requireRole.js` | — | (all protected routes) | — | ✓ | — |
| **Security** | Report ownership | ✅ IMPLEMENTED | `authorizeReportOwner.js` | — | — | — | — | — |
| **Departments** | Department seeding | ✅ IMPLEMENTED | — | 005, 008 | — | — | — | — |
| **Reports** | Create report | ✅ IMPLEMENTED | `issueService.js:createReport` | 000 | POST /api/reports | `ReportForm.jsx` | ✓ | Wire image upload |
| **Reports** | GPS location capture | ✅ IMPLEMENTED | `ReportForm.jsx` | — | — | `ReportForm.jsx` | — | — |
| **Reports** | Image upload (middleware) | ⚠️ PARTIAL | `reportImageUpload.js`, `reportImageProcessor.js` | 009 | — (not wired) | Placeholder text | — | Wire to POST /reports; add Cloudinary creds |
| **Reports** | Cloudinary storage | ⚠️ PARTIAL | `cloudinary.js` | — | — | — | — | Add API_KEY + API_SECRET |
| **Reports** | Duplicate warning (backend) | ⚠️ PARTIAL | `issueService.js` proximity check | — | — (no dedicated endpoint) | — | — | Add GET /issues/nearby; frontend modal |
| **Reports** | My Reports list | ⚠️ PARTIAL | `issueService.js:getMyReports` | — | GET /api/my-reports | ❌ Missing | ✓ | Build `MyReports.jsx` |
| **Reports** | My Report detail | ⚠️ PARTIAL | `issueService.js:getMyReportById` | — | GET /api/my-reports/:id | ❌ Missing | — | Build `IssueDetail.jsx` |
| **Issues** | List all issues | ✅ IMPLEMENTED | `issueService.js:getAllIssues` | — | GET /api/issues | — | ✓ | — |
| **Issues** | Issue detail | ✅ IMPLEMENTED | `issueService.js:getIssueDetails` | — | GET /api/issues/:id | ❌ Missing | — | Build `IssueDetail.jsx` |
| **Issues** | Status update | ✅ IMPLEMENTED | `issueService.js:updateIssueStatus` | — | PATCH /api/issues/:id/status | ❌ Missing admin UI | ✓ | Build admin UI |
| **Issues** | Status history | ✅ IMPLEMENTED | `issue_status_history` table | 000 | GET /api/issues/:id/history | ❌ Missing | ✓ | Show in timeline |
| **Issues** | Evidence upload | ✅ IMPLEMENTED | `issueService.js:uploadEvidence` | — | POST /api/issues/:id/evidence | ❌ Missing admin UI | ✓ | Build admin UI |
| **Issues** | Evidence view | ✅ IMPLEMENTED | `issueService.js:getIssueEvidence` | — | GET /api/issues/:id/evidence | ❌ Missing | — | — |
| **Issues** | REJECTED/REOPENED states | ❌ NOT IMPLEMENTED | — | — | — | — | — | Extend status machine |
| **Issues** | ON_HOLD state | ❌ NOT IMPLEMENTED | — | — | — | — | — | Extend status machine |
| **Authority** | Admin dashboard | ❌ NOT IMPLEMENTED | — | — | — | — | — | Build `AdminDashboard.jsx` |
| **Authority** | Department members | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | Migration + API + UI |
| **Authority** | Issue assignment | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | — |
| **Authority** | SLA / escalation | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | — |
| **Authority** | Audit logs | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | — |
| **GIS** | Coordinate storage | ⚠️ PARTIAL | `civic_issues.latitude/longitude` | 000 | — | — | — | Migrate to PostGIS |
| **GIS** | PostGIS extension | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | `CREATE EXTENSION postgis` |
| **GIS** | Interactive map | ❌ NOT IMPLEMENTED | — | — | — | — | — | Leaflet + OSM |
| **GIS** | Clustering / heatmaps | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **AI** | Image classification | ❌ NOT IMPLEMENTED | — | — | — | — | — | FastAPI service |
| **AI** | Text classification | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **AI** | Duplicate detection | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **AI** | Severity / priority | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **AI** | AI assessments table | ❌ NOT IMPLEMENTED | — | Need migration | — | — | — | — |
| **Notifications** | Email notifications | ❌ NOT IMPLEMENTED | — | — | — | — | — | SendGrid |
| **Notifications** | In-app notifications | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **Analytics** | Admin analytics | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **Production** | CI/CD | ❌ NOT IMPLEMENTED | — | — | — | — | — | GitHub Actions |
| **Production** | Docker | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **Production** | Monitoring | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |
| **Production** | DB backup | ❌ NOT IMPLEMENTED | — | — | — | — | — | — |

**Legend:** ✅ IMPLEMENTED | ⚠️ PARTIAL | ❌ NOT IMPLEMENTED | 🔲 UNVERIFIED
