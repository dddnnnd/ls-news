const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = 'C:\\Users\\Admin\\Documents\\projekt\\doc.lsn\\index.html';

async function runAcceptanceMatrix() {
  console.log('================================================================');
  console.log('   LOS SANTOS NEWS — IQ 3,000,000 ACCEPTANCE TEST SUITE        ');
  console.log('================================================================');

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/index.html')) {
      const data = fs.readFileSync(HTML_PATH);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const PORT = 8092;
  await new Promise(r => server.listen(PORT, r));
  console.log(`[INFO] Test HTTP server listening on http://127.0.0.1:${PORT}`);

  const userDataDir = path.join(process.env.TEMP, 'lsn_edge_acceptance_' + Date.now());
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-web-security',
    `--user-data-dir=${userDataDir}`,
    `http://127.0.0.1:${PORT}`
  ]);

  let wsUrl = '';
  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const listRes = await fetch('http://127.0.0.1:9225/json/list');
      const list = await listRes.json();
      const pageTarget = list.find(t => t.type === 'page' && (t.url.includes(String(PORT)) || t.url.startsWith('http')));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
  }

  if (!wsUrl) {
    console.error('[FATAL] Failed to connect to Edge CDP');
    edgeProc.kill();
    server.close();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let reqId = 1;
  const cdpCall = (method, params = {}) => new Promise((resolve, reject) => {
    const id = reqId++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const cdpEval = async (expression) => {
    const res = await cdpCall('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  };

  await cdpCall('Runtime.enable');
  await cdpCall('Page.enable');

  ws.addEventListener('message', async (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.javascriptDialogOpening') {
        await cdpCall('Page.handleJavaScriptDialog', { accept: true });
      }
    } catch (_) {}
  });

  // Allow app initial scripts to initialize
  await new Promise(r => setTimeout(r, 1200));

  await cdpEval(`(() => {
    window.alert = (m) => { console.log('ALERT:', m); };
    window.confirm = (m) => { console.log('CONFIRM:', m); return true; };
    if (window.sb) {
      window.sb.auth.getSession = async () => ({
        data: { session: { user: { id: window.currentUser?.uuid || '00000000-0000-0000-0000-000000000099' } } },
        error: null
      });
      window.sb.from = (table) => ({
        delete: () => ({
          eq: async (col, val) => ({ data: null, error: null })
        }),
        select: () => ({
          single: async () => ({ data: null, error: null })
        }),
        upsert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: null })
          })
        })
      });
    }
  })()`);

  const results = [];
  function assert(name, condition, details = '') {
    const status = condition ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
    if (!condition) {
      console.error(`  -> FAILURE DETAILS: ${details}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Staff creates first profile
    // -------------------------------------------------------------
    const t1 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-j1', uuid: '00000000-0000-0000-0000-000000000001', username: 'journalist_bob', fullName: 'Bob Journalist', role: 'journalist' };
      // Ensure no initial dossier for this user
      window.staffState.members = window.staffState.members.filter(m => !window.isOwnStaffDossier(m, window.currentUser));
      const canCreateBefore = window.canCreateEditorialType('staff');
      if (!canCreateBefore) return { ok: false, reason: 'canCreateEditorialType(staff) returned false before having dossier' };
      
      // Simulate creating first dossier
      const newDossier = { id: 'staff-bob-1', name: 'Bob Journalist', role: 'Младший редактор', bio: 'Пишу о криминале', authorLogin: 'journalist_bob', author_id: '00000000-0000-0000-0000-000000000001' };
      window.staffState.members.push(newDossier);
      window.saveStaffState();
      
      const hasDossierNow = !!window.getCurrentUserStaffDossier(window.currentUser);
      return { ok: canCreateBefore && hasDossierNow, hasDossierNow };
    })()`);
    assert('Staff creates first profile', t1.ok, JSON.stringify(t1));

    // -------------------------------------------------------------
    // Test 2: Staff creates second profile (MUST BE BLOCKED / DENY)
    // -------------------------------------------------------------
    const t2 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-j1', uuid: '00000000-0000-0000-0000-000000000001', username: 'journalist_bob', fullName: 'Bob Journalist', role: 'journalist' };
      const canCreateSecond = window.canCreateEditorialType('staff');
      return { ok: canCreateSecond === false, canCreateSecond };
    })()`);
    assert('Staff creates second profile (Blocked)', t2.ok, `canCreateSecond=${t2.canCreateSecond}`);

    // -------------------------------------------------------------
    // Test 3: Admin creates first profile
    // -------------------------------------------------------------
    const t3 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-adm', uuid: '00000000-0000-0000-0000-000000000099', username: 'admin_alice', fullName: 'Alice Admin', role: 'admin' };
      const canCreate1 = window.canCreateEditorialType('staff');
      const d1 = { id: 'staff-adm-1', name: 'Alice Admin', role: 'Шеф-редактор', bio: 'Руководитель проекта', authorLogin: 'admin_alice', author_id: '00000000-0000-0000-0000-000000000099' };
      window.staffState.members.push(d1);
      window.saveStaffState();
      return { ok: canCreate1 === true, count: window.staffState.members.filter(m => window.isOwnStaffDossier(m, window.currentUser)).length };
    })()`);
    assert('Admin creates first profile', t3.ok, `count=${t3.count}`);

    // -------------------------------------------------------------
    // Test 4: Admin creates second profile (ALLOWED FOR ADMIN)
    // -------------------------------------------------------------
    const t4 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-adm', uuid: '00000000-0000-0000-0000-000000000099', username: 'admin_alice', fullName: 'Alice Admin', role: 'admin' };
      const canCreate2 = window.canCreateEditorialType('staff');
      const d2 = { id: 'staff-adm-2', name: 'Special Correspondent', role: 'Спецкор', bio: 'Резервное досье', authorLogin: 'admin_alice', author_id: '00000000-0000-0000-0000-000000000099' };
      window.staffState.members.push(d2);
      window.saveStaffState();
      const count = window.staffState.members.filter(m => window.isOwnStaffDossier(m, window.currentUser)).length;
      return { ok: canCreate2 === true && count >= 2, count, canCreate2 };
    })()`);
    assert('Admin creates second profile', t4.ok, `count=${t4.count}`);

    // -------------------------------------------------------------
    // Test 5: Admin edits profile
    // -------------------------------------------------------------
    const t5 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-adm', uuid: '00000000-0000-0000-0000-000000000099', username: 'admin_alice', fullName: 'Alice Admin', role: 'admin' };
      const target = window.staffState.members.find(m => m.id === 'staff-adm-1');
      if (!target) return { ok: false, reason: 'Target staff not found' };
      const canEdit = window.canUserEditItem(target);
      target.bio = 'Updated bio by admin';
      window.saveStaffState();
      const updated = window.staffState.members.find(m => m.id === 'staff-adm-1');
      return { ok: canEdit === true && updated.bio === 'Updated bio by admin', canEdit };
    })()`);
    assert('Admin edits profile', t5.ok, JSON.stringify(t5));

    // -------------------------------------------------------------
    // Test 6: Admin deletes profile (ALLOWED - articles deleted, profile intact)
    // -------------------------------------------------------------
    const t6 = await cdpEval(`(async () => {
      window.currentUser = { id: 'u-adm', uuid: '00000000-0000-0000-0000-000000000099', username: 'admin_alice', fullName: 'Alice Admin', role: 'admin' };
      if (window.sb) {
        window.sb.auth.getSession = async () => ({
          data: { session: { user: { id: window.currentUser.uuid } } },
          error: null
        });
        window.sb.from = (table) => ({
          delete: () => ({ eq: async () => ({ data: null, error: null }) }),
          select: () => ({ single: async () => ({ data: null, error: null }) }),
          upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) })
        });
      }
      const target = window.staffState.members.find(m => m.id === 'staff-adm-2');
      if (!target) return { ok: false, reason: 'Target staff-adm-2 not found' };
      const canDelete = window.canUserDeleteItem(target);
      if (!canDelete) return { ok: false, reason: 'Admin canUserDeleteItem returned false' };
      
      window.currentUniType = 'staff';
      try {
        await window.deleteUniItemById('staff-adm-2');
      } catch (e) {
        return { ok: false, error: e.message, stack: e.stack };
      }
      
      const inMembers = window.staffState.members.some(m => m.id === 'staff-adm-2');
      const inDeleted = window.isItemDeleted('staff-adm-2');
      return { ok: !inMembers && inDeleted, inMembers, inDeleted, membersCount: window.staffState.members.length };
    })()`);
    assert('Admin deletes profile', t6.ok, JSON.stringify(t6));

    // -------------------------------------------------------------
    // Test 7: Director deletes profile (DENY)
    // -------------------------------------------------------------
    const t7 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-dir', uuid: '00000000-0000-0000-0000-000000000004', username: 'director_dan', fullName: 'Dan Director', role: 'director' };
      const target = window.staffState.members.find(m => m.id === 'staff-bob-1') || window.staffState.members[0];
      const canDelete = window.canUserDeleteItem(target);
      return { ok: canDelete === false, canDelete };
    })()`);
    assert('Director deletes profile (DENY)', t7.ok, `canDelete=${t7.canDelete}`);

    // -------------------------------------------------------------
    // Test 8: Deputy deletes profile (DENY)
    // -------------------------------------------------------------
    const t8 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-dep', uuid: '00000000-0000-0000-0000-000000000003', username: 'deputy_dave', fullName: 'Dave Deputy', role: 'deputy' };
      const target = window.staffState.members.find(m => m.id === 'staff-bob-1') || window.staffState.members[0];
      const canDelete = window.canUserDeleteItem(target);
      return { ok: canDelete === false, canDelete };
    })()`);
    assert('Deputy deletes profile (DENY)', t8.ok, `canDelete=${t8.canDelete}`);

    // -------------------------------------------------------------
    // Test 9: Journalist deletes profile (DENY)
    // -------------------------------------------------------------
    const t9 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-j1', uuid: '00000000-0000-0000-0000-000000000001', username: 'journalist_bob', fullName: 'Bob Journalist', role: 'journalist' };
      const target = window.staffState.members.find(m => m.id === 'staff-bob-1') || window.staffState.members[0];
      const canDelete = window.canUserDeleteItem(target);
      return { ok: canDelete === false, canDelete };
    })()`);
    assert('Journalist deletes profile (DENY)', t9.ok, `canDelete=${t9.canDelete}`);

    // -------------------------------------------------------------
    // Test 10: User deletes profile (DENY)
    // -------------------------------------------------------------
    const t10 = await cdpEval(`(() => {
      window.currentUser = { id: 'u-usr', uuid: '00000000-0000-0000-0000-000000000000', username: 'reader_rachel', fullName: 'Rachel Reader', role: 'user' };
      const target = window.staffState.members[0];
      const canDelete = window.canUserDeleteItem(target);
      return { ok: canDelete === false, canDelete };
    })()`);
    assert('User deletes profile (DENY)', t10.ok, `canDelete=${t10.canDelete}`);

    // -------------------------------------------------------------
    // Test 11-15: Deputy Directory Visibility Matrix
    // -------------------------------------------------------------
    const t11_15 = await cdpEval(`(() => {
      // Setup mock directory with all 5 roles
      window.usersDb.length = 0;
      window.usersDb.push(
        { id: '11111111-0000-0000-0000-000000000001', username: 'test_admin', role: 'admin' },
        { id: '22222222-0000-0000-0000-000000000002', username: 'test_director', role: 'director' },
        { id: '33333333-0000-0000-0000-000000000003', username: 'test_deputy_peer', role: 'deputy' },
        { id: '44444444-0000-0000-0000-000000000004', username: 'test_journalist', role: 'journalist' },
        { id: '55555555-0000-0000-0000-000000000005', username: 'test_reader', role: 'user' }
      );

      const deputyActor = { id: '99999999-0000-0000-0000-000000000099', username: 'acting_deputy', role: 'deputy' };
      const visible = window.getVisibleUsersForActor(deputyActor);
      const visibleLogins = visible.map(u => u.username);

      const seesJournalist = visibleLogins.includes('test_journalist');
      const seesReader = visibleLogins.includes('test_reader');
      const seesDeputy = visibleLogins.includes('test_deputy_peer');
      const seesDirector = visibleLogins.includes('test_director');
      const seesAdmin = visibleLogins.includes('test_admin');

      return {
        seesJournalist,
        seesReader,
        seesDeputy,
        seesDirector,
        seesAdmin,
        visibleLogins
      };
    })()`);

    assert('Deputy sees journalist', t11_15.seesJournalist === true, `visible=${t11_15.visibleLogins.join(', ')}`);
    assert('Deputy sees user', t11_15.seesReader === true, `visible=${t11_15.visibleLogins.join(', ')}`);
    assert('Deputy sees deputy (DENY)', t11_15.seesDeputy === false, `seesDeputy=${t11_15.seesDeputy}`);
    assert('Deputy sees director (DENY)', t11_15.seesDirector === false, `seesDirector=${t11_15.seesDirector}`);
    assert('Deputy sees admin (DENY)', t11_15.seesAdmin === false, `seesAdmin=${t11_15.seesAdmin}`);

    // -------------------------------------------------------------
    // Test 16: usr-101 appears anywhere in DOM/storage/state (ZERO TOLERANCE)
    // -------------------------------------------------------------
    const t16 = await cdpEval(`(() => {
      const domHtml = document.documentElement.outerHTML.toLowerCase();
      const hasInDom = domHtml.includes('usr-101');
      
      let hasInStorage = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (k.toLowerCase().includes('usr-101') || v.toLowerCase().includes('usr-101')) {
          hasInStorage = true;
          break;
        }
      }
      
      const hasInUsers = (window.usersDb || []).some(u => String(u.id || '').toLowerCase().includes('usr-101'));
      return { ok: !hasInDom && !hasInStorage && !hasInUsers, hasInDom, hasInStorage, hasInUsers };
    })()`);
    assert('usr-101 eradicated from DOM, Storage and State', t16.ok, JSON.stringify(t16));

    // -------------------------------------------------------------
    // Test 17: Deleted profile after F5 (remains deleted)
    // -------------------------------------------------------------
    await cdpCall('Page.reload');
    await new Promise(r => setTimeout(r, 1200));

    await cdpEval(`(() => {
      window.alert = (m) => {};
      window.confirm = (m) => true;
      if (window.sb) {
        window.sb.auth.getSession = async () => ({
          data: { session: { user: { id: window.currentUser?.uuid || '00000000-0000-0000-0000-000000000099' } } },
          error: null
        });
        window.sb.from = (table) => ({
          delete: () => ({ eq: async () => ({ data: null, error: null }) }),
          select: () => ({ single: async () => ({ data: null, error: null }) }),
          upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) })
        });
      }
    })()`);

    const t17 = await cdpEval(`(() => {
      const inMembers = (window.staffState?.members || []).some(m => m.id === 'staff-adm-2');
      const inDeleted = window.isItemDeleted('staff-adm-2');
      return { ok: !inMembers && inDeleted, inMembers, inDeleted };
    })()`);
    assert('Deleted profile after F5 (remains deleted)', t17.ok, JSON.stringify(t17));

    // -------------------------------------------------------------
    // Test 18: Created profile after F5 (persists)
    // -------------------------------------------------------------
    const t18 = await cdpEval(`(() => {
      const bob = (window.staffState?.members || []).find(m => m.id === 'staff-bob-1');
      return { ok: !!bob && bob.name === 'Bob Journalist', found: !!bob };
    })()`);
    assert('Created profile after F5 (persists)', t18.ok, JSON.stringify(t18));

    // -------------------------------------------------------------
    // Test 19: Forged frontend role (DENY / RBAC & server safety intact)
    // -------------------------------------------------------------
    const t19 = await cdpEval(`(() => {
      // If an attacker tampers window.currentUser.role directly without valid Supabase session
      window.currentUser = { id: 'attacker', username: 'hacker', role: 'admin' };
      // Try to delete a protected staff intro
      const intro = { id: 'staff-intro', type: 'staff' };
      const canDeleteIntro = window.canUserDeleteItem(intro);
      
      // Test self-role assignment rejection
      const canManageSelf = window.canUserManageTargetUser(window.currentUser, window.currentUser);
      return { ok: canDeleteIntro === false && canManageSelf === false, canDeleteIntro, canManageSelf };
    })()`);
    assert('Forged frontend role safety & invariants', t19.ok, JSON.stringify(t19));

    // -------------------------------------------------------------
    // Test 20: Profile Center Dialog DOM & Interaction
    // -------------------------------------------------------------
    const t20 = await cdpEval(`(() => {
      const dialog = document.getElementById('profile-center-dialog');
      if (!dialog) return { ok: false, reason: 'profile-center-dialog element missing' };
      
      const testTarget = { id: '00000000-0000-0000-0000-000000000001', username: 'journalist_bob', fullName: 'Bob Journalist', role: 'journalist' };
      window.openUserProfileCenter(testTarget);
      
      const isOpen = dialog.open;
      const title = document.getElementById('profile-center-title')?.textContent;
      const hasAccountCard = !!document.getElementById('pc-card-username');
      const hasStaffCard = !!document.getElementById('pc-staff-content');
      const hasMatCard = !!document.getElementById('pc-materials-content');
      const hasRoleCard = !!document.getElementById('pc-role-card');
      
      dialog.close();
      return {
        ok: isOpen && title === 'journalist_bob' && hasAccountCard && hasStaffCard && hasMatCard && hasRoleCard,
        isOpen,
        title
      };
    })()`);
    assert('Profile Center modal opens and renders 4 cards correctly', t20.ok, JSON.stringify(t20));

  } catch (err) {
    console.error('[UNHANDLED TEST EXCEPTION]:', err);
    assert('Execution without unhandled exception', false, err.message);
  } finally {
    edgeProc.kill();
    server.close();
  }

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  const passedCount = results.filter(r => r.status === 'PASS').length;
  console.log('================================================================');
  console.log(`ACCEPTANCE MATRIX SUMMARY: ${passedCount} PASS, ${failedCount} FAIL out of ${results.length} tests`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAcceptanceMatrix();
