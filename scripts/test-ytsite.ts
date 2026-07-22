import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  const url = `https://youtubetranscript.com/?server_vid2=${videoId}`;
  console.log("Fetching server_vid2 from:", url);
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Referer": "https://youtubetranscript.com/"
      }
    });
    console.log("Status:", res.status);
    const contentType = res.headers.get("content-type");
    console.log("Content-Type:", contentType);
    const text = await res.text();
    console.log("Response length:", text.length);
    console.log("Response preview (first 1000 chars):");
    console.log(text.substring(0, 1000));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
