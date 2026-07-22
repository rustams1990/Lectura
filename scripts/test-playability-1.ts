import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  
  const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
  const botUA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

  const uas = { mobileUA, botUA };
  
  for (const [name, ua] of Object.entries(uas)) {
    console.log(`\nTesting with UA: ${name}`);
    try {
      const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const html = await resPage.text();
      
      const index = html.indexOf("ytInitialPlayerResponse = ");
      if (index !== -1) {
        // extract json
        const start = index + "ytInitialPlayerResponse = ".length;
        let braceCount = 0;
        let jsonStr = "";
        for (let i = start; i < html.length; i++) {
          const c = html[i];
          if (c === "{") braceCount++;
          if (c === "}") braceCount--;
          jsonStr += c;
          if (braceCount === 0) break;
        }
        try {
          const parsed = JSON.parse(jsonStr.trim().replace(/;$/, ""));
          console.log("Playability Status:", JSON.stringify(parsed?.playabilityStatus || null, null, 2));
          console.log("Captions Exist?", !!parsed?.captions);
          if (parsed?.captions) {
            console.log("Captions fields:", Object.keys(parsed.captions));
            console.log("captionTracks:", parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks);
          }
        } catch (e) {
          console.log("JSON Parse Error, first 100 chars:", jsonStr.substring(0, 100));
        }
      } else {
        console.log("ytInitialPlayerResponse not found");
      }
    } catch (err) {
      console.error(err);
    }
  }
}

run();
