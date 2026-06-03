const API_URL = 'https://crm-backend-production-cb2c.up.railway.app/api';

async function test() {
  console.log("Logging in...");
  let cookie;
  try {
    let res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@admin.com', password: 'password123' })
    });
    if (!res.ok) {
      res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@admin.com', password: 'password123' })
      });
      if (!res.ok) {
        res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@admin.com', password: '12345678' })
        });
        if (!res.ok) return console.error("All logins failed");
      }
    }
    cookie = res.headers.get('set-cookie');
  } catch(e) { return console.error(e); }

  const reqHeaders = { 'Content-Type': 'application/json', 'Cookie': cookie };
  
  const dummyClient = {
    name: "تجربة أداء " + Date.now(),
    phone: "010" + Math.floor(10000000 + Math.random() * 90000000),
    regionId: 1,
    visitType: "WEEKLY",
    status: "ACTIVE",
    address: "عنوان تجريبي",
    products: "منتج تجريبي"
  };

  // 2. Add New Client (Different Data)
  console.log(`\nAdding NEW client...`);
  let start = Date.now();
  let createdId;
  let res = await fetch(`${API_URL}/clients`, { method: 'POST', headers: reqHeaders, body: JSON.stringify(dummyClient) });
  if (res.ok) {
    const data = await res.json();
    console.log(`[SUCCESS] New Client Added in ${Date.now() - start}ms`);
    createdId = data.item.id;
  } else { console.error(`[ERROR] Took ${Date.now() - start}ms`, await res.text()); return; }

  // 3. Add Duplicate by Phone
  console.log(`\nAdding DUPLICATE phone...`);
  start = Date.now();
  res = await fetch(`${API_URL}/clients`, { 
    method: 'POST', headers: reqHeaders, body: JSON.stringify({ ...dummyClient, name: "اسم مختلف تماما" }) 
  });
  if (!res.ok) {
    const data = await res.json();
    console.log(`[EXPECTED 409] Duplicate Phone check took ${Date.now() - start}ms - ${data.message}`);
  }

  // 4. Add Duplicate by Name
  console.log(`\nAdding DUPLICATE name (Different phone)...`);
  start = Date.now();
  res = await fetch(`${API_URL}/clients`, { 
    method: 'POST', headers: reqHeaders, body: JSON.stringify({ ...dummyClient, phone: "011" + Math.floor(10000000 + Math.random() * 90000000) }) 
  });
  if (!res.ok) {
    const data = await res.json();
    console.log(`[EXPECTED 409] Duplicate Name check took ${Date.now() - start}ms - ${data.message}`);
  }

  // 5. Cleanup
  console.log(`\nCleaning up ID: ${createdId}...`);
  await fetch(`${API_URL}/clients/${createdId}`, { method: 'DELETE', headers: reqHeaders });
  console.log("Cleanup done.");
}
test();
