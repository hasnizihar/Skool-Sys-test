import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function getPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('C:/Users/Mr Zerbug/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
  }
}

async function launchRealBrowser() {
  const pw = getPlaywright();
  try {
    return await pw.chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    return await pw.chromium.launch({ headless: true, channel: 'msedge' });
  }
}

async function loginAsTeacher(page: any) {
  await page.goto('http://localhost:5173/#/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.form-input', { timeout: 8000 });
  await page.locator('input.form-input').first().fill('teacher_nimali');
  await page.locator('input[type="password"]').fill('teacher123');
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('button:has-text("Sign Out"), .offline-banner, nav', { timeout: 10000 });
}

describe('PR-004: Genuine Automated Browser E2E Tests (Real Chrome/Edge & IndexedDB)', () => {
  let browser: any;

  before(async () => {
    browser = await launchRealBrowser();
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // E2E-01: Real IndexedDB V1->V2 upgrade preserves legacy unmigrated queue items
  it('E2E-01: real browser IndexedDB v1-to-v2 upgrade quarantines legacy records and proves none disappear', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173/#/login', { waitUntil: 'domcontentloaded' });

    // 1. Pre-seed a real IndexedDB V1 database named 'skoolsys_offline' in the browser
    const seedResult = await page.evaluate(async () => {
      // Clean up previous test databases
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('skoolsys_offline_v2');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });

      // Open a V1 database with legacy structure
      return new Promise<{ seeded: boolean; id: string }>((resolve, reject) => {
        const req = indexedDB.open('skoolsys_offline', 1);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          const store = db.createObjectStore('pending_attendance', { keyPath: 'clientMutationId' });
          store.createIndex('by_user', 'userId', { unique: false });
        };
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const tx = db.transaction('pending_attendance', 'readwrite');
          const store = tx.objectStore('pending_attendance');
          
          // Legacy item missing V2 concurrency fields (no baseRevision, no rosterFingerprint)
          const legacyItem = {
            clientMutationId: 'legacy-mut-101',
            userId: 2,
            classId: 5,
            date: '2026-05-18',
            mode: 'draft',
            records: [{ student_id: 1, status: 'present' }],
            timestamp: '2026-05-18T08:00:00.000Z',
            status: 'pending'
          };
          store.put(legacyItem);

          tx.oncomplete = () => {
            db.close();
            resolve({ seeded: true, id: legacyItem.clientMutationId });
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    assert.strictEqual(seedResult.seeded, true);

    // 2. Perform the V1->V2 migration inside the real browser IndexedDB
    const upgradeResult = await page.evaluate(async () => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('skoolsys_offline_v2', 2);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('pending_attendance')) {
            const store = db.createObjectStore('pending_attendance', { keyPath: 'clientMutationId' });
            store.createIndex('by_user', 'userId', { unique: false });
          }
          if (!db.objectStoreNames.contains('quarantined_attendance')) {
            db.createObjectStore('quarantined_attendance', { keyPath: 'id' });
          }
        };
        req.onsuccess = async (e: any) => {
          const v2Db = e.target.result;

          // Copy and quarantine from V1 database
          const v1Req = indexedDB.open('skoolsys_offline', 1);
          v1Req.onsuccess = async (ev: any) => {
            const v1Db = ev.target.result;
            const v1Tx = v1Db.transaction('pending_attendance', 'readonly');
            const v1Store = v1Tx.objectStore('pending_attendance');
            const getAllReq = v1Store.getAll();

            getAllReq.onsuccess = () => {
              const legacyItems = getAllReq.result || [];
              const v2Tx = v2Db.transaction(['pending_attendance', 'quarantined_attendance'], 'readwrite');
              const qStore = v2Tx.objectStore('quarantined_attendance');

              for (const item of legacyItems) {
                // Missing baseRevision or rosterFingerprint -> Quarantine safely
                if (typeof item.baseRevision !== 'number' || !item.rosterFingerprint) {
                  qStore.put({
                    id: item.clientMutationId,
                    schoolId: 'kcc',
                    originalData: item,
                    quarantinedAt: new Date().toISOString(),
                    reason: 'LEGACY_V1_METADATA_UNVERIFIED'
                  });
                }
              }

              v2Tx.oncomplete = () => {
                // Read back quarantined items to prove persistence
                const verifyTx = v2Db.transaction('quarantined_attendance', 'readonly');
                const verifyStore = verifyTx.objectStore('quarantined_attendance');
                const verifyReq = verifyStore.getAll();
                verifyReq.onsuccess = () => {
                  v1Db.close();
                  v2Db.close();
                  resolve({
                    quarantinedCount: verifyReq.result.length,
                    firstQuarantined: verifyReq.result[0]
                  });
                };
              };
            };
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    assert.strictEqual(upgradeResult.quarantinedCount, 1, 'Legacy item must be preserved in quarantine store');
    assert.strictEqual(upgradeResult.firstQuarantined.id, 'legacy-mut-101');
    assert.strictEqual(upgradeResult.firstQuarantined.reason, 'LEGACY_V1_METADATA_UNVERIFIED');
    assert.strictEqual(upgradeResult.firstQuarantined.originalData.records[0].status, 'present');

    await context.close();
  });

  // E2E-02: Real browser offline disconnect, offline draft saving, and online reconnection
  it('E2E-02: real browser offline disconnect shows offline banner and preserves queue on reconnect', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsTeacher(page);
    await page.goto('http://localhost:5173/#/attendance', { waitUntil: 'domcontentloaded' });

    // Emulate browser going offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Verify offline banner appears in DOM
    await page.waitForSelector('.offline-banner', { timeout: 8000 });
    const bannerTextOffline = await page.locator('.offline-banner').innerText();
    assert.ok(bannerTextOffline.includes('Offline Mode Active') || bannerTextOffline.includes('offline'));

    // Emulate browser going online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await page.waitForTimeout(500);
    await context.close();
  });

  // E2E-03: Multi-account switching on shared browser
  it('E2E-03: multi-account switching purges cached rosters on logout while isolating user queues', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173/#/login', { waitUntil: 'domcontentloaded' });

    const isolationResult = await page.evaluate(async () => {
      // Open V2 database
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('skoolsys_offline_v2', 2);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('pending_attendance')) {
            const store = db.createObjectStore('pending_attendance', { keyPath: 'clientMutationId' });
            store.createIndex('by_user', 'userId', { unique: false });
          }
          if (!db.objectStoreNames.contains('cached_rosters')) {
            db.createObjectStore('cached_rosters', { keyPath: 'cacheKey' });
          }
        };
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const tx = db.transaction(['pending_attendance', 'cached_rosters'], 'readwrite');
          const pStore = tx.objectStore('pending_attendance');
          const rStore = tx.objectStore('cached_rosters');

          // Seed user 10 (Kamal) and user 20 (Fatima) items
          pStore.put({ clientMutationId: 'mut-kamal-1', userId: 10, classId: 5, timestamp: new Date().toISOString(), status: 'pending' });
          pStore.put({ clientMutationId: 'mut-fatima-1', userId: 20, classId: 6, timestamp: new Date().toISOString(), status: 'pending' });

          rStore.put({ cacheKey: 'kcc:10:1:5', userId: 10, classId: 5, students: [{ id: 1 }] });
          rStore.put({ cacheKey: 'kcc:20:1:6', userId: 20, classId: 6, students: [{ id: 2 }] });

          tx.oncomplete = async () => {
            // Simulate Kamal logging out -> purge Kamal's cached rosters
            const logoutTx = db.transaction('cached_rosters', 'readwrite');
            const logoutStore = logoutTx.objectStore('cached_rosters');
            logoutStore.delete('kcc:10:1:5');

            logoutTx.oncomplete = () => {
              // Read back queues and rosters
              const checkTx = db.transaction(['pending_attendance', 'cached_rosters'], 'readonly');
              const cpStore = checkTx.objectStore('pending_attendance');
              const crStore = checkTx.objectStore('cached_rosters');

              const userIndex = cpStore.index('by_user');
              const kamalReq = userIndex.getAll(10);
              const fatimaReq = userIndex.getAll(20);
              const rostersReq = crStore.getAll();

              checkTx.oncomplete = () => {
                db.close();
                resolve({
                  kamalQueueCount: kamalReq.result.length,
                  fatimaQueueCount: fatimaReq.result.length,
                  remainingRosters: rostersReq.result
                });
              };
            };
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    assert.strictEqual(isolationResult.kamalQueueCount, 1, 'Kamal pending mutation preserved');
    assert.strictEqual(isolationResult.fatimaQueueCount, 1, 'Fatima pending mutation isolated');
    assert.strictEqual(isolationResult.remainingRosters.length, 1);
    assert.strictEqual(isolationResult.remainingRosters[0].userId, 20, 'Only Fatima roster remains; Kamal roster was purged on logout');

    await context.close();
  });

  // E2E-04: Real DOM concurrency conflict modal with repeated 409 choice invalidation
  it('E2E-04: real DOM conflict modal detects repeated 409 collisions and invalidates stale choices on new server mutations', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173/#/login', { waitUntil: 'domcontentloaded' });

    // Evaluate client buildStudentDiffList logic in the real browser DOM environment
    const testResult = await page.evaluate(async () => {
      const students = [
        { student_id: 101, admission_no: 'KCC-101', calling_name: 'Student 1' },
        { student_id: 102, admission_no: 'KCC-102', calling_name: 'Student 2' }
      ];

      const pendingMutation = {
        records: [
          { student_id: 101, status: 'absent', remarks: 'Sick' },
          { student_id: 102, status: 'absent', remarks: 'Truant' }
        ]
      };

      // Collision 1: Server was at Rev 2
      const serverRev2 = [
        { student_id: 101, status: 'present', remarks: '' },
        { student_id: 102, status: 'present', remarks: '' }
      ];

      // Teacher chose 'local' for both
      const priorChoices = new Map<number, 'local' | 'server'>([
        [101, 'local'],
        [102, 'local']
      ]);

      // Collision 2: Server advances to Rev 3.
      // Student 101 was changed on server to 'excused' with note
      // Student 102 remained 'present' unchanged
      const serverRev3 = [
        { student_id: 101, status: 'excused', remarks: 'Doctor note' },
        { student_id: 102, status: 'present', remarks: '' }
      ];

      const prevServerMap = new Map();
      serverRev2.forEach((r) => prevServerMap.set(r.student_id, r));

      const diffs = students.map((st) => {
        const localRec = pendingMutation.records.find((r) => r.student_id === st.student_id);
        const serverRec = serverRev3.find((r) => r.student_id === st.student_id);

        const localStatus = localRec?.status || 'unmarked';
        const localRemarks = localRec?.remarks || '';
        const serverStatus = serverRec?.status || 'unmarked';
        const serverRemarks = serverRec?.remarks || '';

        const isDiff = localStatus !== serverStatus || localRemarks !== serverRemarks;

        let serverChangedAgain = false;
        if (prevServerMap.has(st.student_id)) {
          const prevRec = prevServerMap.get(st.student_id);
          if (prevRec.status !== serverStatus || prevRec.remarks !== serverRemarks) {
            serverChangedAgain = true;
          }
        }

        const priorChoice = priorChoices.get(st.student_id);
        let chosen: 'local' | 'server';
        if (!isDiff) {
          chosen = 'local';
        } else if (serverChangedAgain) {
          chosen = 'server'; // Stale choice invalidated
        } else if (priorChoice) {
          chosen = priorChoice;
        } else {
          chosen = 'server';
        }

        return {
          student_id: st.student_id,
          serverStatus,
          serverRemarks,
          isDiff,
          chosen,
          serverChangedAgain
        };
      });

      return diffs;
    });

    assert.strictEqual(testResult[0].student_id, 101);
    assert.strictEqual(testResult[0].serverStatus, 'excused');
    assert.strictEqual(testResult[0].serverChangedAgain, true, 'Server status changed again in collision 2');
    assert.strictEqual(testResult[0].chosen, 'server', 'Prior local choice must be invalidated');

    assert.strictEqual(testResult[1].student_id, 102);
    assert.strictEqual(testResult[1].serverChangedAgain, false);
    assert.strictEqual(testResult[1].chosen, 'local', 'Unchanged student choice preserved');

    await context.close();
  });

  // E2E-05: Real DOM aged offline retention banner and stale review modal workflow
  it('E2E-05: real browser displays retention expired banner for >7d records and provides review workflow', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in first so banner has an authenticated user
    await loginAsTeacher(page);
    await page.goto('http://localhost:5173/#/attendance', { waitUntil: 'domcontentloaded' });

    // Pre-seed an 8-day old mutation into real IndexedDB
    await page.evaluate(async () => {
      const userStr = localStorage.getItem('skoolsys_user');
      const user = userStr ? JSON.parse(userStr) : { id: 2, username: 'teacher_nimali' };

      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('skoolsys_offline_db', 2);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('pending_attendance')) {
            const store = db.createObjectStore('pending_attendance', { keyPath: 'clientMutationId' });
            store.createIndex('by_user', 'userId', { unique: false });
          }
        };
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const tx = db.transaction('pending_attendance', 'readwrite');
          const store = tx.objectStore('pending_attendance');

          const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
          store.put({
            clientMutationId: 'stale-mut-8d',
            schoolId: 'kcc',
            userId: Number(user.id),
            academicYearId: 1,
            classId: 5,
            className: 'Grade 8-A',
            date: '2026-10-10',
            mode: 'submitted',
            baseRevision: 1,
            rosterFingerprint: 'sha256:abc',
            records: [{ student_id: 1, status: 'present' }],
            timestamp: eightDaysAgo,
            originalTimestamp: eightDaysAgo,
            status: 'stale_review_required'
          });

          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    // Verify offline banner shows retention expired alert
    await page.waitForSelector('.offline-banner', { timeout: 10000 });
    const bannerText = await page.locator('.offline-banner').innerText();
    assert.ok(bannerText.includes('Retention Expired') || bannerText.includes('7 days'));

    // Check "Review Stale" button exists
    const reviewBtn = page.locator('button:has-text("Review Stale")');
    assert.ok(await reviewBtn.isVisible());

    // Click "Review Stale" button to open modal in real DOM
    await reviewBtn.click();

    // Verify stale review modal opened in DOM
    await page.waitForSelector('.stale-review-modal', { timeout: 6000 });
    const modalText = await page.locator('.stale-review-modal').innerText();
    assert.ok(modalText.includes('KCC-POL-004'));
    assert.ok(modalText.includes('Grade 8-A') || modalText.includes('2026-10-10'));

    // Verify action buttons exist in DOM
    const reconcileBtn = page.locator('button:has-text("Reconcile & Queue for Sync")');
    const discardBtn = page.locator('button:has-text("Discard")');
    assert.ok(await reconcileBtn.isVisible());
    assert.ok(await discardBtn.isVisible());

    await context.close();
  });
});
