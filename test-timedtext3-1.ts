import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=it&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=it&kind=asr&fmt=srv3`,
    `https://video.google.com/timedtext?v=${videoId}&lang=it&kind=asr`,
    `https://video.google.com/timedtext?hl=it&v=${videoId}&lang=it&type=track&name=&kind=asr&fmt=1`,
    `https://www.youtube.com/api/timedtext?hl=it&v=${videoId}&lang=it&type=track&name=&kind=asr&fmt=vtt`
  ];

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });
      console.log("Status:", resp.status);
      const text = await resp.text();
      console.log("Text length:", text.length);
      console.log("Text preview:", text.substring(0, 300));
    } catch (e: any) {
      console.error(e.message);
    }
  }
}

run();
