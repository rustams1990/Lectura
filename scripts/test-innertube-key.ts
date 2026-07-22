import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  const apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
  
  const clients = [
    { name: "WEB", version: "2.20230622.01.00", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" },
    { name: "MWEB", version: "2.20230622.01.00", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1" },
    { name: "ANDROID_MUSIC", version: "5.16.51", ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36" },
    { name: "TVHTML5", version: "7.20230622.01.00", ua: "Mozilla/5.0 (Chromecast; GoogleTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
  ];

  for (const client of clients) {
    console.log(`\nTesting with Client: ${client.name}`);
    
    const body = {
      videoId: videoId,
      context: {
        client: {
          clientName: client.name,
          clientVersion: client.version,
          hl: "en",
          gl: "US"
        }
      }
    };
    
    try {
      const resPlayer = await fetch(playerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.ua,
          "Referer": "https://www.youtube.com/"
        },
        body: JSON.stringify(body)
      });
      
      console.log("Status:", resPlayer.status);
      const parsed: any = await resPlayer.json();
      
      if (parsed.error) {
        console.log("Error response:", JSON.stringify(parsed.error));
      } else {
        console.log("Playability Status:", JSON.stringify(parsed?.playabilityStatus || null, null, 2));
        console.log("Captions Exist?", !!parsed?.captions);
        if (parsed?.captions) {
          console.log("First captionTrack:", parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]);
        }
      }
    } catch (err: any) {
      console.error("Error:", err);
    }
  }
}

run();
