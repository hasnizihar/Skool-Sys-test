# KCC SkoolSys 2.0 — Controlled Pilot Prerequisites & Known Limitations

**Project:** Kattankudy Central College — SkoolSys 2.0  
**Phase:** Transition from MVP Demonstration to Controlled School Pilot  
**Target Milestone:** Controlled Live Pilot Launch

---

## 1. Controlled Pilot Prerequisites

Before any real student or staff data is imported into SkoolSys 2.0, the following mandatory governance, technical, and operational requirements must be fulfilled.

### A. Governance & Authorization
1. **Written Principal & Management Board Approval:**
   - Formal sign-off on the pilot charter, specifying the participating classes, duration (typically one academic term), and authorized user accounts.
2. **Data Protection & Privacy Compliance:**
   - Strict adherence to student privacy regulations. No student records may be entered without explicit school enrollment authorization.
   - PII protection: Guardian mobile numbers and home addresses must only be visible to authorized administrators and homeroom class teachers.
3. **Designated Pilot Coordinator:**
   - Appointment of an on-site academic officer (e.g., Vice Principal or IT Section Head) as primary operational liaison.

### B. Technical & Infrastructure Requirements
1. **Dedicated On-Premises or Secure Local Server Hardware:**
   - Dedicated physical machine or virtual appliance running Node.js 22 LTS with local SSD storage.
   - Isolated SQLite database storage with restricted filesystem permissions (`chmod 600` / Windows NTFS restricted ACL).
2. **Secure Local Network Access (Intranet / TLS):**
   - Access restricted to school internal network (LAN/WLAN) or secure VPN.
   - TLS/HTTPS encryption enabled for all browser-to-server traffic.
3. **Verified Backup & Restore Procedure:**
   - While automated cloud disaster recovery (PR-006) remains deferred, a verified daily local snapshot script and pre-migration backup mechanism must be operational on the pilot server.
   - Daily automated database dumps stored on secondary detached storage media.
4. **Browser Hardware Compatibility:**
   - Modern browsers (Chrome, Edge, Firefox, Safari) on desktop, laptop, or tablet devices for participating teachers.

### C. Recommended Pilot Scope Boundary
To minimize disruption and ensure smooth adoption:
- **Recommended Grade Band:** Select **one Junior Secondary class** (e.g., Grade 8-A, ~35 students) and **one Senior Secondary class** (e.g., Grade 11-A, ~35 students).
- **Duration:** 1 complete academic term (Term 1 or Term 2).
- **Dual-Run Period:** Run SkoolSys in parallel with existing paper records for the first 3 weeks to establish 100% data reconciliation before switching to primary digital record keeping.

---

## 2. Known Limitations of Current MVP

The MVP has been optimized for high performance, academic integrity, and intuitive workflow execution. The following known limitations are documented for pilot planning:

| # | Limitation | Current Behavior | Planned Post-Pilot Enhancement |
| :-: | :--- | :--- | :--- |
| **1** | **Offline Multi-Device Sync** | Offline attendance caching uses browser IndexedDB with automated conflict resolution. If multiple teachers submit different registers for the same class offline simultaneously, a reconciliation modal prompts manual review. | Real-time WebSocket synchronization across devices. |
| **2** | **Automated Cloud Backup & DR** | Automated off-site cloud replication (PR-006) is intentionally deferred. Current system relies on verified local snapshots and pre-migration backup archives. | PR-006 Automated Cloud Backup with encrypted off-site replication to Google Cloud Storage / AWS S3. |
| **3** | **Parent SMS Notifications** | Daily absentee reports display guardian phone numbers for manual school telephone inquiry. Direct automated SMS dispatch is not active. | Institutional SMS gateway integration with Dialog/Mobitel aggregator APIs. |
| **4** | **Student/Parent Direct Portal** | System accounts are currently provisioned for Principal, Vice Principal, Section Heads, Class Teachers, and Subject Teachers. | Read-only Student & Parent mobile portal with OTP verification. |
| **5** | **Batch CSV Import Tooling** | Student enrollment and teacher assignments are loaded via database migrations or seed scripts. | Admin UI for bulk CSV file upload with real-time validation and error preview. |

---

## 3. Pilot Readiness Checklist

- [ ] Principal and School Management Board written authorization received.
- [ ] Pilot server provisioned with Node.js 22 LTS, HTTPS certificate, and restricted database permissions.
- [ ] Verified daily backup cron job configured targeting external drive.
- [ ] Participating teachers briefed on scoped logins and attendance workflows.
- [ ] Section Heads trained on marks endorsement and moderation queues.
- [ ] Emergency contact procedure established between school IT and software team.
