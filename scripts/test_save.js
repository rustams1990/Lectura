import fs from 'fs';

async function run() {
  try {
    // 1. Register
    let res = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test1@test.com', password: 'password', name: 'Test' })
    });
    let data = await res.json();
    console.log("Register:", data);
    const token = data.token;

    // 2. Post data
    res = await fetch('http://localhost:3000/api/server-db', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        data: {
          lessons: [{
            id: '123',
            title: 'Test',
            text: 'Test',
            targetLanguage: 'english',
            translationLanguage: 'russian'
          }],
          vocab: {
            'english_test': {
              word: 'test',
              status: 'known'
            }
          }
        }
      })
    });
    data = await res.json();
    console.log("Post DB:", data);

    // 3. Get data
    res = await fetch('http://localhost:3000/api/server-db', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    console.log("Get DB:", JSON.stringify(data, null, 2));
    
  } catch (e) {
    console.error(e);
  }
}

run();
