import fetch from "node-fetch";

// Helper from server.ts to extract playerResponse
function extractPlayerResponse(html: string): any {
  let index = html.indexOf("ytInitialPlayerResponse");
  while (index !== -1) {
    const startChar = html.indexOf("{", index);
    if (startChar !== -1) {
      let braceCount = 0;
      let inString = false;
      let escape = false;
      for (let i = startChar; i < html.length; i++) {
        const char = html[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === "{") braceCount++;
          else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.substring(startChar, i + 1);
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed?.playabilityStatus) return parsed;
              } catch (e) { /* ignore */ }
              break;
            }
          }
        }
      }
    }
    index = html.indexOf("ytInitialPlayerResponse", index + 1);
  }

  // Method 2: Search for playerCaptionsTracklistRenderer directly
  let indexCap = html.indexOf('"playerCaptionsTracklistRenderer"');
  if (indexCap === -1) indexCap = html.indexOf("playerCaptionsTracklistRenderer");
  if (indexCap !== -1) {
    let searchStart = indexCap;
    while (searchStart > 0 && indexCap - searchStart < 3000) {
      searchStart = html.lastIndexOf("{", searchStart - 1);
      if (searchStart === -1) break;
      let braceCount = 0;
      let inString = false;
      let escape = false;
      for (let i = searchStart; i < html.length; i++) {
        const char = html[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === "{") braceCount++;
          else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.substring(searchStart, i + 1);
              try {
                const parsed = JSON.parse(jsonStr);
                const tracks = parsed?.playerCaptionsTracklistRenderer?.captionTracks ||
                               parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (tracks) return parsed.captions ? parsed : { captions: parsed };
              } catch (e) { /* ignore */ }
              break;
            }
          }
        }
      }
    }
  }

  return null;
}

async function run() {
  const videoId = "mXrRQ5fMWHw";
  // We can try fetching via different CORS proxies
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    `https://corsproxy.io/?${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
  ];

  for (const url of proxies) {
    console.log(`\nFetching watch page through proxy: ${url.substring(0, 100)}...`);
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 10000
      } as any);

      console.log("Status:", resp.status);
      if (resp.status === 200) {
        const html = await resp.text();
        console.log(`HTML length: ${html.length}`);
        
        // Check playabilityStatus or captions
        const playerResponseObj = extractPlayerResponse(html);
        if (playerResponseObj) {
          console.log("Found playabilityStatus:", playerResponseObj.playabilityStatus?.status);
          console.log("Reason:", playerResponseObj.playabilityStatus?.reason);
          const tracks = playerResponseObj.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          console.log("Caption Tracks Exist?", !!tracks);
          if (tracks) {
            console.log("Tracks list:");
            console.log(JSON.stringify(tracks, null, 2));
            break; // Found it!
          }
        } else {
          console.log("Could not find ytInitialPlayerResponse in the page.");
        }
      } else {
        console.log("HTTP error status:", resp.status);
      }
    } catch (e: any) {
      console.log("Failed proxy fetch:", e.message);
    }
  }
}

run();
