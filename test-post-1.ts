import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  const url = "https://yt-transcript-api.vercel.app/api";

  const payloads = [
    { v: videoId },
    { videoId: videoId },
    { video_id: videoId },
    { id: videoId },
    { url: `https://www.youtube.com/watch?v=${videoId}` }
  ];

  for (const body of payloads) {
    console.log(`\nTesting POST with body:`, JSON.stringify(body));
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0"
        },
        body: JSON.stringify(body),
        timeout: 5000
      } as any);
      console.log("Status:", resp.status);
      const text = await resp.text();
      console.log("Response (truncated):");
      console.log(text.substring(0, 500));
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
}

run();
