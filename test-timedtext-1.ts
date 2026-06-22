import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  
  const urls = [
    `https://google.com/timedtext?type=list&v=${videoId}`,
    `https://video.google.com/timedtext?type=list&v=${videoId}`,
    `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`
  ];

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        }
      });
      console.log("Status:", resp.status);
      const text = await resp.text();
      console.log("Text first 300 chars:", text.substring(0, 300));
    } catch (err: any) {
      console.error(err.message);
    }
  }
}

run();
