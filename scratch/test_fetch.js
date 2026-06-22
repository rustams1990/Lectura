import fetch from 'node-fetch'; // or use native fetch since Node 18+

async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/server-db");
    console.log("Status:", res.status);
    if (res.ok) {
      const body = await res.json();
      console.log("Body status:", body.status);
      if (body.data) {
        console.log("Lessons count:", body.data.lessons?.length);
        console.log("Lingqs count:", body.data.lingqs ? Object.keys(body.data.lingqs).length : "none");
        console.log("WordLinks count:", body.data.wordLinks ? Object.keys(body.data.wordLinks).length : "none");
        
        // Let's inspect lingqs values for any null or unexpected values
        if (body.data.lingqs) {
          let nullKeys = [];
          let weirdKeys = [];
          for (const [key, value] of Object.entries(body.data.lingqs)) {
            if (value === null || value === undefined) {
              nullKeys.push(key);
            } else if (typeof value !== 'object') {
              weirdKeys.push({ key, type: typeof value, value });
            }
          }
          console.log("Null keys in server response:", nullKeys.length);
          if (nullKeys.length > 0) {
            console.log("Sample null keys:", nullKeys.slice(0, 10));
          }
          console.log("Weird keys in server response:", weirdKeys.length);
          if (weirdKeys.length > 0) {
            console.log("Sample weird keys:", weirdKeys.slice(0, 10));
          }
        }
      }
    } else {
      console.log("Error response:", await res.text());
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

run();
